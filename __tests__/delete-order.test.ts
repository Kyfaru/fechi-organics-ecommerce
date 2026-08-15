/**
 * Unit tests for lib/orders/delete-order.ts — the cascading order-delete
 * transaction used by DELETE /api/admin/orders/[id] (super-admin only).
 *
 * Mocks: @/lib/db ($transaction invokes the callback with a fake tx object
 * exposing only the methods the code under test calls, mirroring the pattern
 * in __tests__/orders.test.ts), @/lib/r2 (deleteR2Object).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTransaction = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderDelete = vi.fn();
const mockInStoreOrderFindUnique = vi.fn();
const mockInStoreOrderDelete = vi.fn();
const mockTestimonialUpdateMany = vi.fn();
const mockInboxMessageDeleteMany = vi.fn();
const mockCouponRedemptionDeleteMany = vi.fn();
const mockTransactionDeleteMany = vi.fn();
const mockInStoreTransactionFindMany = vi.fn();
const mockInStoreTransactionDeleteMany = vi.fn();
const mockMpesaC2bUpdateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
}));

const mockDeleteR2Object = vi.fn();
vi.mock("@/lib/r2", () => ({
  deleteR2Object: (...args: unknown[]) => mockDeleteR2Object(...args),
}));

import { deleteOrder } from "@/lib/orders/delete-order";

function makeTx() {
  return {
    order: { findUnique: mockOrderFindUnique, delete: mockOrderDelete },
    inStoreOrder: { findUnique: mockInStoreOrderFindUnique, delete: mockInStoreOrderDelete },
    testimonial: { updateMany: mockTestimonialUpdateMany },
    inboxMessage: { deleteMany: mockInboxMessageDeleteMany },
    couponRedemption: { deleteMany: mockCouponRedemptionDeleteMany },
    transaction: { deleteMany: mockTransactionDeleteMany },
    inStoreTransaction: { findMany: mockInStoreTransactionFindMany, deleteMany: mockInStoreTransactionDeleteMany },
    mpesaC2bTransaction: { updateMany: mockMpesaC2bUpdateMany },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(makeTx()));
  mockTestimonialUpdateMany.mockResolvedValue({ count: 1 });
  mockInboxMessageDeleteMany.mockResolvedValue({ count: 1 });
  mockCouponRedemptionDeleteMany.mockResolvedValue({ count: 1 });
  mockTransactionDeleteMany.mockResolvedValue({ count: 1 });
  mockInStoreTransactionDeleteMany.mockResolvedValue({ count: 1 });
  mockMpesaC2bUpdateMany.mockResolvedValue({ count: 1 });
  mockOrderDelete.mockResolvedValue({});
  mockInStoreOrderDelete.mockResolvedValue({});
});

describe("deleteOrder — online order (kind: 'order')", () => {
  it("nulls testimonial.orderId (keeps the testimonial), deletes inbox/coupon/transactions, deletes the order, and deletes the R2 invoice", async () => {
    mockOrderFindUnique.mockResolvedValue({ orderNumber: "#FO-123", invoicePdfKey: "invoices/foo.pdf" });

    const result = await deleteOrder({ id: "order-1", kind: "order", reason: "test", actorAdminProfileId: "admin-1" });

    expect(mockTestimonialUpdateMany).toHaveBeenCalledWith({ where: { orderId: "order-1" }, data: { orderId: null } });
    expect(mockInboxMessageDeleteMany).toHaveBeenCalledWith({ where: { orderId: "order-1" } });
    expect(mockCouponRedemptionDeleteMany).toHaveBeenCalledWith({ where: { orderId: "order-1" } });
    expect(mockTransactionDeleteMany).toHaveBeenCalledWith({ where: { orderId: "order-1" } });
    expect(mockOrderDelete).toHaveBeenCalledWith({ where: { id: "order-1" } });

    // Transactions must be cleared before the order row itself — transaction.orderId
    // has no onDelete (defaults to Restrict), so this ordering is load-bearing.
    const deleteManyOrder = mockTransactionDeleteMany.mock.invocationCallOrder[0];
    const orderDeleteOrder = mockOrderDelete.mock.invocationCallOrder[0];
    expect(deleteManyOrder).toBeLessThan(orderDeleteOrder);

    expect(mockDeleteR2Object).toHaveBeenCalledWith("invoices/foo.pdf");
    expect(result).toEqual({ orderNumber: "#FO-123", invoicePdfKey: "invoices/foo.pdf" });
  });

  it("skips the R2 delete when there's no invoice", async () => {
    mockOrderFindUnique.mockResolvedValue({ orderNumber: "#FO-123", invoicePdfKey: null });

    await deleteOrder({ id: "order-1", kind: "order", reason: "test", actorAdminProfileId: "admin-1" });

    expect(mockDeleteR2Object).not.toHaveBeenCalled();
  });

  it("throws when the order doesn't exist", async () => {
    mockOrderFindUnique.mockResolvedValue(null);

    await expect(
      deleteOrder({ id: "missing", kind: "order", reason: "test", actorAdminProfileId: "admin-1" })
    ).rejects.toThrow("Order not found");

    expect(mockOrderDelete).not.toHaveBeenCalled();
  });
});

describe("deleteOrder — in-store order (kind: 'instore')", () => {
  it("nulls the mpesaC2bTransaction pointer before deleting inStoreTransaction rows, then deletes the order", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({ orderNumber: "#STORE-123", invoicePdfKey: "invoices/bar.pdf" });
    mockInStoreTransactionFindMany.mockResolvedValue([{ id: "tx-1" }, { id: "tx-2" }]);

    await deleteOrder({ id: "instore-1", kind: "instore", reason: "test", actorAdminProfileId: "admin-1" });

    expect(mockMpesaC2bUpdateMany).toHaveBeenCalledWith({
      where: { matchedInStoreTransactionId: { in: ["tx-1", "tx-2"] } },
      data: { matchedInStoreTransactionId: null },
    });
    expect(mockInStoreTransactionDeleteMany).toHaveBeenCalledWith({ where: { inStoreOrderId: "instore-1" } });
    expect(mockInStoreOrderDelete).toHaveBeenCalledWith({ where: { id: "instore-1" } });

    const c2bNullOrder = mockMpesaC2bUpdateMany.mock.invocationCallOrder[0];
    const txDeleteOrder = mockInStoreTransactionDeleteMany.mock.invocationCallOrder[0];
    expect(c2bNullOrder).toBeLessThan(txDeleteOrder);

    expect(mockDeleteR2Object).toHaveBeenCalledWith("invoices/bar.pdf");
  });

  it("skips the mpesaC2bTransaction update when there are no transactions", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({ orderNumber: "#STORE-123", invoicePdfKey: null });
    mockInStoreTransactionFindMany.mockResolvedValue([]);

    await deleteOrder({ id: "instore-1", kind: "instore", reason: "test", actorAdminProfileId: "admin-1" });

    expect(mockMpesaC2bUpdateMany).not.toHaveBeenCalled();
  });

  it("throws when the in-store order doesn't exist", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue(null);

    await expect(
      deleteOrder({ id: "missing", kind: "instore", reason: "test", actorAdminProfileId: "admin-1" })
    ).rejects.toThrow("Order not found");

    expect(mockInStoreOrderDelete).not.toHaveBeenCalled();
  });
});
