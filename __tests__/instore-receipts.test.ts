/**
 * Unit tests for the in-store receipt/retry/cancel/stream plumbing:
 *  - app/api/admin/orders/instore/[id]/send-receipt/route.ts — per-channel
 *    missing-contact-info rejections
 *  - app/api/admin/orders/instore/mpesa/initiate/route.ts — retry branch's
 *    "order not FAILED" rejection
 *  - app/api/admin/orders/instore/[id]/cancel-wait/route.ts — no-op when
 *    nothing is PENDING
 *  - app/api/admin/orders/instore/stream/route.ts — immediate short-circuit
 *    responses for already-resolved orders
 *
 * Mocks: @/lib/auth, @/lib/db, @/lib/redis, @/lib/ratelimit,
 * @/lib/invoice/get-or-create-instore-invoice, @/lib/email, @/lib/twilio,
 * @/lib/payments/instore-post-payment (same pattern as __tests__/instore-payments.test.ts)
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
// Mock lib/redis.ts
// ---------------------------------------------------------------------------
const mockRedisGet = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: mockRedisGet,
    set: vi.fn().mockResolvedValue("OK"),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock lib/ratelimit.ts — always "no Upstash configured" so tests are
// deterministic regardless of the environment they run in.
// ---------------------------------------------------------------------------
vi.mock("@/lib/ratelimit", () => ({
  makeRatelimit: () => null,
}));

// ---------------------------------------------------------------------------
// Mock lib/invoice/get-or-create-instore-invoice.ts — avoid touching R2/PDF
// rendering entirely, these tests only care about routing/validation logic.
// ---------------------------------------------------------------------------
const mockGetOrCreateInStoreInvoice = vi.fn();
vi.mock("@/lib/invoice/get-or-create-instore-invoice", () => ({
  getOrCreateInStoreInvoice: (...args: unknown[]) => mockGetOrCreateInStoreInvoice(...args),
}));

// ---------------------------------------------------------------------------
// Mock lib/email.ts / lib/twilio.ts
// ---------------------------------------------------------------------------
const mockSendInvoiceEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendInvoiceEmail: (...args: unknown[]) => mockSendInvoiceEmail(...args),
}));

const mockSendSms = vi.fn();
vi.mock("@/lib/twilio", () => ({
  sendSms: (...args: unknown[]) => mockSendSms(...args),
}));

// ---------------------------------------------------------------------------
// Mock lib/payments/instore-post-payment.ts
// ---------------------------------------------------------------------------
const mockMarkInStorePaymentFailed = vi.fn();
vi.mock("@/lib/payments/instore-post-payment", () => ({
  markInStorePaymentFailed: (...args: unknown[]) => mockMarkInStorePaymentFailed(...args),
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockUserFindUnique = vi.fn();
const mockBranchFindUnique = vi.fn();
const mockProductFindMany = vi.fn();
const mockInStoreOrderFindUnique = vi.fn();
const mockInStoreOrderUpdate = vi.fn();
const mockInStoreTransactionFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    branch: { findUnique: (...args: unknown[]) => mockBranchFindUnique(...args) },
    product: { findMany: (...args: unknown[]) => mockProductFindMany(...args) },
    inStoreOrder: {
      findUnique: (...args: unknown[]) => mockInStoreOrderFindUnique(...args),
      update: (...args: unknown[]) => mockInStoreOrderUpdate(...args),
    },
    inStoreTransaction: {
      findFirst: (...args: unknown[]) => mockInStoreTransactionFindFirst(...args),
    },
  },
}));

import { POST as sendReceiptPOST } from "@/app/api/admin/orders/instore/[id]/send-receipt/route";
import { POST as retryInitiatePOST } from "@/app/api/admin/orders/instore/mpesa/initiate/route";
import { POST as cancelWaitPOST } from "@/app/api/admin/orders/instore/[id]/cancel-wait/route";
import { GET as streamGET } from "@/app/api/admin/orders/instore/stream/route";

function makeRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const ADMIN_SESSION = { user: { id: "admin-1" } };
const BRANCH_ID = "1d321a5e-f7a6-4cb1-9002-a55801313ac1";
const ADMIN_USER = {
  id: "admin-1",
  name: "Admin One",
  role: "admin",
  adminProfile: { isSuperAdmin: false, branchId: BRANCH_ID },
};
const BRANCH = {
  id: BRANCH_ID,
  shortcode: "600001",
  isActive: true,
  mpesaGateway: "DARAJA",
  invoiceNumber: "INV1",
  consumerKeyEnc: "enc-key",
  consumerSecretEnc: "enc-secret",
  apiKeyEnc: null,
  paystackSubaccount: null,
};
const PRODUCT = { id: "prod-1", name: "Face Cream", priceKes: 150000, isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(ADMIN_SESSION);
  mockUserFindUnique.mockResolvedValue(ADMIN_USER);
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/instore/[id]/send-receipt
// ---------------------------------------------------------------------------
describe("POST /api/admin/orders/instore/[id]/send-receipt", () => {
  const INVOICE = { url: "https://cdn.example.com/invoices/instore-order-1.pdf", invoiceNumber: "INV-IS-ORDER1", buffer: Buffer.from("pdf") };

  beforeEach(() => {
    mockGetOrCreateInStoreInvoice.mockResolvedValue(INVOICE);
  });

  it("rejects channel=email with 400 NO_EMAIL when the order has no email on file", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({
      id: "order-1", orderNumber: "#IS-001", totalKes: 300000, customerEmail: null, customerPhone: "254712345678",
    });

    const res = await sendReceiptPOST(
      makeRequest("http://localhost/api/admin/orders/instore/order-1/send-receipt", "POST", { channel: "email" }),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("NO_EMAIL");
    expect(mockSendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("rejects channel=sms with 400 NO_PHONE when the order has no phone on file", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({
      id: "order-1", orderNumber: "#IS-001", totalKes: 300000, customerEmail: "walkin@example.com", customerPhone: null,
    });

    const res = await sendReceiptPOST(
      makeRequest("http://localhost/api/admin/orders/instore/order-1/send-receipt", "POST", { channel: "sms" }),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("NO_PHONE");
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it("sends the email channel successfully when an address is on file", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({
      id: "order-1", orderNumber: "#IS-001", totalKes: 300000, customerEmail: "walkin@example.com", customerPhone: null,
    });
    mockSendInvoiceEmail.mockResolvedValue(undefined);

    const res = await sendReceiptPOST(
      makeRequest("http://localhost/api/admin/orders/instore/order-1/send-receipt", "POST", { channel: "email" }),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.sent).toEqual(["email"]);
    expect(mockSendInvoiceEmail).toHaveBeenCalledOnce();
    expect(mockInStoreOrderUpdate).toHaveBeenCalledWith({ where: { id: "order-1" }, data: { receiptSentEmail: true } });
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/instore/mpesa/initiate — retry branch
// ---------------------------------------------------------------------------
describe("POST /api/admin/orders/instore/mpesa/initiate (retry)", () => {
  beforeEach(() => {
    mockBranchFindUnique.mockResolvedValue(BRANCH);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
  });

  it("rejects with 400 NOT_RETRYABLE when the order isn't in a FAILED state", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({
      id: "order-1",
      branchId: BRANCH_ID,
      paymentStatus: "PENDING", // not FAILED — can't retry a still-pending or already-paid order
    });

    const res = await retryInitiatePOST(
      makeRequest("http://localhost/api/admin/orders/instore/mpesa/initiate", "POST", {
        customerPhone: "0712345678",
        items: [{ productId: "prod-1", quantity: 1 }],
        retryOrderId: "order-1",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("NOT_RETRYABLE");
    // Must reject before ever updating the order or creating a new transaction.
    expect(mockInStoreOrderUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/instore/[id]/cancel-wait
// ---------------------------------------------------------------------------
describe("POST /api/admin/orders/instore/[id]/cancel-wait", () => {
  it("is a no-op returning ok({}) when there's no PENDING transaction", async () => {
    mockInStoreTransactionFindFirst.mockResolvedValue(null);

    const res = await cancelWaitPOST(
      makeRequest("http://localhost/api/admin/orders/instore/order-1/cancel-wait", "POST"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({});
    expect(mockMarkInStorePaymentFailed).not.toHaveBeenCalled();
  });

  it("cancels the most recent PENDING transaction when one exists", async () => {
    mockInStoreTransactionFindFirst.mockResolvedValue({ id: "tx-1" });
    mockMarkInStorePaymentFailed.mockResolvedValue(undefined);

    const res = await cancelWaitPOST(
      makeRequest("http://localhost/api/admin/orders/instore/order-1/cancel-wait", "POST"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockMarkInStorePaymentFailed).toHaveBeenCalledWith({
      transactionId: "tx-1",
      inStoreOrderId: "order-1",
      reason: "Cancelled by admin while waiting",
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/orders/instore/stream — immediate short-circuits
// ---------------------------------------------------------------------------
describe("GET /api/admin/orders/instore/stream", () => {
  it("returns an immediate payment_success payload for an already-PAID order", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({ id: "order-1", paymentStatus: "PAID" });

    const res = await streamGET(
      makeRequest("http://localhost/api/admin/orders/instore/stream?inStoreOrderId=order-1", "GET"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ type: "payment_success", inStoreOrderId: "order-1", immediate: true });
  });

  it("returns an immediate payment_failed payload for an already-FAILED order", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({ id: "order-1", paymentStatus: "FAILED" });

    const res = await streamGET(
      makeRequest("http://localhost/api/admin/orders/instore/stream?inStoreOrderId=order-1", "GET"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ type: "payment_failed", inStoreOrderId: "order-1", immediate: true });
  });

  it("returns 400 when inStoreOrderId is missing", async () => {
    const res = await streamGET(
      makeRequest("http://localhost/api/admin/orders/instore/stream", "GET"),
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when the order doesn't exist", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue(null);

    const res = await streamGET(
      makeRequest("http://localhost/api/admin/orders/instore/stream?inStoreOrderId=missing", "GET"),
    );

    expect(res.status).toBe(404);
  });
});
