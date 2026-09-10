/**
 * Unit tests for the in-store order payment plumbing:
 *  - lib/payments/instore-post-payment.ts idempotency (mark success/failed twice)
 *  - app/api/admin/orders/instore/mpesa/c2b/claim/route.ts amount-mismatch + already-claimed
 *  - app/api/payments/mpesa/c2b/confirmation/route.ts duplicate-transId handling
 *
 * Mocks: @/lib/auth, @/lib/db, @/lib/redis (same pattern as __tests__/orders.test.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock lib/auth.ts
// ---------------------------------------------------------------------------
const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock lib/redis.ts — the success/failure signal must never throw
// ---------------------------------------------------------------------------
const mockRedisSet = vi.fn().mockResolvedValue("OK");
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ set: mockRedisSet, get: vi.fn(), incr: vi.fn().mockResolvedValue(1), expire: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock lib/invoice/get-or-create-instore-invoice.ts — pre-generation is a
// synchronous, never-throws side effect of the success path; these tests
// aren't exercising invoice generation, so keep it a no-op instead of letting
// it hit the (unmocked-for-findUnique) db stub below.
// ---------------------------------------------------------------------------
const mockGetOrCreateInStoreInvoice = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/invoice/get-or-create-instore-invoice", () => ({
  getOrCreateInStoreInvoice: (...args: unknown[]) => mockGetOrCreateInStoreInvoice(...args),
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockUserFindUnique = vi.fn();
const mockBranchFindUnique = vi.fn();
const mockBranchFindFirst = vi.fn();
const mockProductFindMany = vi.fn();

const mockInStoreTransactionFindUnique = vi.fn();
const mockInStoreTransactionUpdate = vi.fn();
const mockInStoreTransactionCreate = vi.fn();
const mockInStoreOrderUpdate = vi.fn();
const mockInStoreOrderCreate = vi.fn();
const mockInStoreOrderItemFindMany = vi.fn();
const mockProductUpdate = vi.fn();
const mockStockUpsert = vi.fn();
const mockMpesaC2bFindUnique = vi.fn();
const mockMpesaC2bUpdate = vi.fn();
const mockMpesaC2bCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    branch: {
      findUnique: (...args: unknown[]) => mockBranchFindUnique(...args),
      findFirst: (...args: unknown[]) => mockBranchFindFirst(...args),
    },
    product: {
      findMany: (...args: unknown[]) => mockProductFindMany(...args),
      update: (...args: unknown[]) => mockProductUpdate(...args),
    },
    branchProductStock: {
      upsert: (...args: unknown[]) => mockStockUpsert(...args),
    },
    inStoreTransaction: {
      findUnique: (...args: unknown[]) => mockInStoreTransactionFindUnique(...args),
      update: (...args: unknown[]) => mockInStoreTransactionUpdate(...args),
      create: (...args: unknown[]) => mockInStoreTransactionCreate(...args),
    },
    inStoreOrder: {
      update: (...args: unknown[]) => mockInStoreOrderUpdate(...args),
      create: (...args: unknown[]) => mockInStoreOrderCreate(...args),
      findUnique: vi.fn(),
    },
    inStoreOrderItem: {
      findMany: (...args: unknown[]) => mockInStoreOrderItemFindMany(...args),
    },
    mpesaC2bTransaction: {
      findUnique: (...args: unknown[]) => mockMpesaC2bFindUnique(...args),
      update: (...args: unknown[]) => mockMpesaC2bUpdate(...args),
      create: (...args: unknown[]) => mockMpesaC2bCreate(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
}));

import { markInStorePaymentFailed, markInStorePaymentSuccess } from "@/lib/payments/instore-post-payment";
import { POST as claimPOST } from "@/app/api/admin/orders/instore/mpesa/c2b/claim/route";
import { POST as confirmationPOST } from "@/app/api/payments/mpesa/c2b/confirmation/route";

function makeRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// markInStorePaymentSuccess / markInStorePaymentFailed — idempotency
// ---------------------------------------------------------------------------
describe("markInStorePaymentSuccess idempotency", () => {
  it("only decrements stock and updates the order once across two calls", async () => {
    // First call sees PENDING and processes; second call sees SUCCESS and bails early.
    mockInStoreTransactionFindUnique
      .mockResolvedValueOnce({ status: "PENDING" })
      .mockResolvedValueOnce({ status: "SUCCESS" });
    mockInStoreOrderItemFindMany.mockResolvedValue([{ productId: "prod-1", quantity: 2 }]);
    mockInStoreOrderUpdate.mockResolvedValue({ branchId: "branch-1" });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        inStoreTransaction: { findUnique: mockInStoreTransactionFindUnique, update: mockInStoreTransactionUpdate },
        inStoreOrder: { update: mockInStoreOrderUpdate },
        inStoreOrderItem: { findMany: mockInStoreOrderItemFindMany },
        branchProductStock: { upsert: mockStockUpsert },
      };
      return fn(tx);
    });

    const args = {
      transactionId: "tx-1",
      inStoreOrderId: "order-1",
      transactionData: { status: "SUCCESS" as const, mpesaReceiptNumber: "ABC123" },
    };

    await markInStorePaymentSuccess(args);
    await markInStorePaymentSuccess(args);

    expect(mockInStoreTransactionFindUnique).toHaveBeenCalledTimes(2);
    // Only the first call should have reached the write path.
    expect(mockInStoreTransactionUpdate).toHaveBeenCalledTimes(1);
    expect(mockInStoreOrderUpdate).toHaveBeenCalledTimes(1);
    expect(mockInStoreOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: "PAID" } }),
    );
    // Branch-scoped stock, not the deprecated global product.stock column.
    expect(mockStockUpsert).toHaveBeenCalledTimes(1);
    expect(mockStockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId_productId: { branchId: "branch-1", productId: "prod-1" } },
        update: { stock: { decrement: 2 } },
      }),
    );

    // Redis signal fires on every call (best-effort) — not the correctness guard.
    expect(mockRedisSet).toHaveBeenCalledTimes(2);
  });
});

describe("markInStorePaymentFailed idempotency", () => {
  it("only flips status to FAILED once across two calls", async () => {
    mockInStoreTransactionFindUnique
      .mockResolvedValueOnce({ status: "PENDING" })
      .mockResolvedValueOnce({ status: "FAILED" });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        inStoreTransaction: { findUnique: mockInStoreTransactionFindUnique, update: mockInStoreTransactionUpdate },
        inStoreOrder: { update: mockInStoreOrderUpdate },
      };
      return fn(tx);
    });

    const args = { transactionId: "tx-1", inStoreOrderId: "order-1", reason: "0:Cancelled" };

    await markInStorePaymentFailed(args);
    await markInStorePaymentFailed(args);

    expect(mockInStoreTransactionUpdate).toHaveBeenCalledTimes(1);
    expect(mockInStoreOrderUpdate).toHaveBeenCalledTimes(1);
    expect(mockInStoreOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: "FAILED" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/instore/mpesa/c2b/claim
// ---------------------------------------------------------------------------
describe("POST /api/admin/orders/instore/mpesa/c2b/claim", () => {
  const ADMIN_SESSION = { user: { id: "admin-1" } };
  const ADMIN_USER = {
    id: "admin-1",
    name: "Admin One",
    role: "admin",
    adminProfile: { isSuperAdmin: true, branchId: null },
  };
  const BRANCH_ID = "1d321a5e-f7a6-4cb1-9002-a55801313ac1";
  const BRANCH = {
    id: BRANCH_ID,
    shortcode: "600001",
    isActive: true,
    mpesaGateway: "DARAJA",
    paystackSubaccount: null,
  };
  const PRODUCT = { id: "prod-1", name: "Face Cream", priceKes: 150000, isActive: true };

  function claimBody(overrides = {}) {
    return {
      c2bTransactionId: "c2b-1",
      items: [{ productId: "prod-1", quantity: 2 }], // subtotal = 300000
      branchId: BRANCH_ID,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue(ADMIN_USER);
    mockBranchFindUnique.mockResolvedValue(BRANCH);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
  });

  it("rejects with 400 AMOUNT_MISMATCH when the C2B row amount doesn't match the computed total", async () => {
    mockMpesaC2bFindUnique.mockResolvedValue({ id: "c2b-1", transId: "QAB123", transAmount: 250000 });

    const res = await claimPOST(
      makeRequest("http://localhost/api/admin/orders/instore/mpesa/c2b/claim", claimBody()),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("AMOUNT_MISMATCH");
    // Must reject before ever opening a write transaction.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects with 409 ALREADY_CLAIMED when the row was claimed between read and write", async () => {
    // Amount matches (300000) so the route proceeds to the transaction.
    mockMpesaC2bFindUnique.mockResolvedValue({ id: "c2b-1", transId: "QAB123", transAmount: 300000 });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        mpesaC2bTransaction: {
          // Fresh read inside the transaction sees it's already been claimed.
          findUnique: vi.fn().mockResolvedValue({ matchedInStoreTransactionId: "already-tx" }),
          update: mockMpesaC2bUpdate,
        },
        inStoreOrder: { create: mockInStoreOrderCreate },
        inStoreTransaction: { create: mockInStoreTransactionCreate },
        product: { update: mockProductUpdate },
      };
      return fn(tx);
    });

    const res = await claimPOST(
      makeRequest("http://localhost/api/admin/orders/instore/mpesa/c2b/claim", claimBody()),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("ALREADY_CLAIMED");
    // No order/transaction should have been created.
    expect(mockInStoreOrderCreate).not.toHaveBeenCalled();
  });

  it("claims successfully when the amount matches and the row is unclaimed", async () => {
    mockMpesaC2bFindUnique.mockResolvedValue({ id: "c2b-1", transId: "QAB123", transAmount: 300000 });
    mockInStoreOrderCreate.mockResolvedValue({ id: "order-1", orderNumber: "#IS-001250101120000000" });
    mockInStoreTransactionCreate.mockResolvedValue({ id: "instore-tx-1" });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        mpesaC2bTransaction: {
          findUnique: vi.fn().mockResolvedValue({ matchedInStoreTransactionId: null }),
          update: mockMpesaC2bUpdate,
        },
        inStoreOrder: { create: mockInStoreOrderCreate },
        inStoreTransaction: { create: mockInStoreTransactionCreate },
        branchProductStock: { upsert: mockStockUpsert },
      };
      return fn(tx);
    });

    const res = await claimPOST(
      makeRequest("http://localhost/api/admin/orders/instore/mpesa/c2b/claim", claimBody()),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.inStoreOrderId).toBe("order-1");
    expect(mockMpesaC2bUpdate).toHaveBeenCalledWith({
      where: { id: "c2b-1" },
      data: { matchedInStoreTransactionId: "instore-tx-1" },
    });
    // Branch-scoped stock, not the deprecated global product.stock column.
    expect(mockStockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId_productId: { branchId: BRANCH_ID, productId: "prod-1" } },
        update: { stock: { decrement: 2 } },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/payments/mpesa/c2b/confirmation
// ---------------------------------------------------------------------------
describe("POST /api/payments/mpesa/c2b/confirmation", () => {
  const CONFIRMATION_BODY = {
    TransactionType: "Pay Bill",
    TransID: "QAB123XYZ",
    TransTime: "20260709120000",
    TransAmount: "1500.00",
    BusinessShortCode: "600001",
    BillRefNumber: "N/A",
    MSISDN: "254712345678",
    FirstName: "Jane",
    MiddleName: "",
    LastName: "Doe",
  };

  it("still acks 200 when the transId already exists (Safaricom retry)", async () => {
    mockBranchFindFirst.mockResolvedValue({ id: "branch-1", shortcode: "600001", isActive: true });
    // Simulate Prisma's unique constraint violation on the duplicate transId.
    mockMpesaC2bCreate.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    const res = await confirmationPOST(
      makeRequest("http://localhost/api/payments/mpesa/c2b/confirmation", CONFIRMATION_BODY),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe("0");
    expect(mockMpesaC2bCreate).toHaveBeenCalledOnce();
  });

  it("logs the transaction and acks 200 on first receipt", async () => {
    mockBranchFindFirst.mockResolvedValue({ id: "branch-1", shortcode: "600001", isActive: true });
    mockMpesaC2bCreate.mockResolvedValue({ id: "c2b-new" });

    const res = await confirmationPOST(
      makeRequest("http://localhost/api/payments/mpesa/c2b/confirmation", CONFIRMATION_BODY),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe("0");
    expect(mockMpesaC2bCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: "branch-1",
          transId: "QAB123XYZ",
          transAmount: 150000, // Math.round(1500.00 * 100)
          msisdn: "254712345678",
        }),
      }),
    );
  });

  it("still acks 200 (never throws past the handler) when the branch lookup fails", async () => {
    mockBranchFindFirst.mockRejectedValue(new Error("DB unavailable"));

    const res = await confirmationPOST(
      makeRequest("http://localhost/api/payments/mpesa/c2b/confirmation", CONFIRMATION_BODY),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe("0");
  });
});
