/**
 * Regression test for lib/payments/post-payment.ts's Zoho push branch
 * resolution: it must use the order's own branchId (resolved at checkout
 * from the delivery address — see app/api/payments/{mpesa,kcb,paystack}/initiate),
 * not a hardcoded "main branch" fallback. The earlier hardcoded-main-branch
 * version caused every online order to be attributed to the main branch's
 * Zoho Location regardless of which branch actually fulfilled it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPushSaleReceiptToZoho = vi.fn();
vi.mock("@/lib/zoho/push-sale-receipt", () => ({
  pushSaleReceiptToZoho: (...args: unknown[]) => mockPushSaleReceiptToZoho(...args),
}));

const mockResolveZohoOrganizationId = vi.fn();
vi.mock("@/lib/zoho/resolve-org", () => ({
  resolveZohoOrganizationId: (...args: unknown[]) => mockResolveZohoOrganizationId(...args),
}));

vi.mock("@/lib/zoho/payment-mode", () => ({
  paymentModeForOnline: () => "Mpesa(KCB)",
}));

vi.mock("@/lib/qstash", () => ({ publishQstashJSON: vi.fn() }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ set: vi.fn() }) }));
vi.mock("@/lib/payment-channel", () => ({ paymentChannel: (id: string) => `payment:${id}` }));
vi.mock("@/lib/orders/generate-order-number", () => ({ generateOrderNumber: vi.fn() }));

const NAKURU_BRANCH_ID = "branch-nakuru";
const ORDER = {
  id: "order-1",
  orderNumber: "FO-0001",
  branchId: NAKURU_BRANCH_ID,
  discountKes: 0,
  deliveryKes: 35000,
  userId: "user-1",
  user: { name: "Jane Doe", email: "jane@example.com" },
  items: [{ productId: "prod-1", name: "Cream", quantity: 1, priceKes: 150000 }],
};

// vi.mock factories are hoisted above top-level const declarations, so the
// mock object itself must be created via vi.hoisted to be safely referenced
// both inside the factory and in the tests below.
const mockDb = vi.hoisted(() => {
  const db: Record<string, unknown> = {
    transaction: {
      findUnique: vi.fn().mockResolvedValue({ status: "PENDING", provider: "KCB" }),
      update: vi.fn(),
    },
    order: {
      findUnique: vi.fn().mockResolvedValue({ orderNumber: "FO-0001" }),
      update: vi.fn(),
    },
    product: { update: vi.fn() },
    cart: { findUnique: vi.fn().mockResolvedValue(null) },
    cartItem: { deleteMany: vi.fn() },
    branch: { findFirst: vi.fn() },
  };
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return db;
});
vi.mock("@/lib/db", () => ({ db: mockDb }));

import { markPaymentSuccess } from "@/lib/payments/post-payment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = mockDb as any;

beforeEach(() => {
  vi.clearAllMocks();
  db.transaction.findUnique.mockResolvedValue({ status: "PENDING", provider: "KCB" });
  db.order.findUnique.mockResolvedValue({ orderNumber: "FO-0001" });
  db.order.update.mockResolvedValue(ORDER);
  mockResolveZohoOrganizationId.mockResolvedValue("org-a");
  mockPushSaleReceiptToZoho.mockResolvedValue({ salesReceiptId: "SR-1" });
});

describe("markPaymentSuccess — Zoho branch attribution", () => {
  it("resolves the Zoho org and pushes using the order's own branchId, not a hardcoded main branch", async () => {
    await markPaymentSuccess({
      transactionId: "tx-1",
      orderId: "order-1",
      transactionData: {},
    });

    // Give the fire-and-forget block a tick to run
    await new Promise((r) => setTimeout(r, 0));

    expect(mockResolveZohoOrganizationId).toHaveBeenCalledWith(NAKURU_BRANCH_ID);
    expect(db.branch.findFirst).not.toHaveBeenCalled();
    expect(mockPushSaleReceiptToZoho).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: NAKURU_BRANCH_ID, organizationId: "org-a" }),
    );
  });

  it("skips the Zoho push without touching branch.findFirst when the order has no branchId", async () => {
    db.order.update.mockResolvedValue({ ...ORDER, branchId: null });

    await markPaymentSuccess({
      transactionId: "tx-1",
      orderId: "order-1",
      transactionData: {},
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(mockPushSaleReceiptToZoho).not.toHaveBeenCalled();
    expect(db.branch.findFirst).not.toHaveBeenCalled();
  });
});
