/**
 * Unit tests for app/api/admin/workers/dispatch-stk/route.ts — the
 * idempotency claim and kind-routing around dispatchStk(). The failover
 * classification logic itself is covered by __tests__/dispatch-stk.test.ts;
 * this file covers what only the worker route owns: the Redis NX claim that
 * stops a QStash redelivery from ever triggering a second real STK push, and
 * the reload guard that no-ops once a transaction already has a
 * checkoutRequestId.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockVerifyQstashRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/qstash", () => ({
  verifyQstashRequest: (...a: unknown[]) => mockVerifyQstashRequest(...a),
  publishQstashJSON: vi.fn().mockResolvedValue({ messageId: "x" }),
}));

const mockRedisSet = vi.fn().mockResolvedValue("OK");
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ set: (...a: unknown[]) => mockRedisSet(...a) }),
}));

const mockTransactionFindUnique = vi.fn();
const mockInStoreTransactionFindUnique = vi.fn();
const mockBranchFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    transaction: { findUnique: (...a: unknown[]) => mockTransactionFindUnique(...a) },
    inStoreTransaction: { findUnique: (...a: unknown[]) => mockInStoreTransactionFindUnique(...a) },
    branch: { findUnique: (...a: unknown[]) => mockBranchFindUnique(...a) },
  },
}));

const mockAssertGatewayEnv = vi.fn();
vi.mock("@/lib/payments/gateway-env", () => ({
  assertGatewayEnv: () => mockAssertGatewayEnv(),
}));

const mockResolveMpesaGateway = vi.fn().mockReturnValue("KCB_BUNI");
vi.mock("@/lib/payments/mpesa/gateway", () => ({
  resolveMpesaGateway: (...a: unknown[]) => mockResolveMpesaGateway(...a),
}));

const mockDispatchStk = vi.fn();
vi.mock("@/lib/payments/dispatch-stk", () => ({
  dispatchStk: (...a: unknown[]) => mockDispatchStk(...a),
}));

const mockFinalizeStkDispatch = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/payments/finalize-stk-dispatch", () => ({
  finalizeStkDispatch: (...a: unknown[]) => mockFinalizeStkDispatch(...a),
}));

import { POST } from "@/app/api/admin/workers/dispatch-stk/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/workers/dispatch-stk", {
    method: "POST",
    headers: { "Content-Type": "application/json", "upstash-signature": "sig" },
    body: JSON.stringify(body),
  });
}

const PENDING_ONLINE_TX = {
  status: "PENDING",
  checkoutRequestId: null,
  orderId: "order-1",
  amount: 150000,
  branchId: "branch-1",
  order: { deliveryPhone: "254712345678", orderNumber: "MPESA123" },
};

const PENDING_INSTORE_TX = {
  status: "PENDING",
  checkoutRequestId: null,
  inStoreOrderId: "instore-order-1",
  amount: 150000,
  inStoreOrder: { branchId: "branch-1", customerPhone: "254712345678", orderNumber: "INS123" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyQstashRequest.mockResolvedValue(true);
  mockRedisSet.mockResolvedValue("OK"); // claim succeeds by default
  mockBranchFindUnique.mockResolvedValue({ id: "branch-1" });
  mockDispatchStk.mockResolvedValue({ success: true, checkoutRequestId: "ws_CO_1", gatewayUsed: "KCB_BUNI" });
});

describe("POST /api/admin/workers/dispatch-stk — signature and claim", () => {
  it("rejects an invalid QStash signature without touching the claim or the DB", async () => {
    mockVerifyQstashRequest.mockResolvedValue(false);
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    expect(res.status).toBe(401);
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it("skips dispatch when the NX claim is already held (QStash redelivery)", async () => {
    mockRedisSet.mockResolvedValue(null); // NX: key already exists
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toMatch(/already claimed/);
    expect(mockDispatchStk).not.toHaveBeenCalled();
    expect(mockTransactionFindUnique).not.toHaveBeenCalled();
  });

  it("returns 503 without dispatching when the Redis claim itself errors", async () => {
    mockRedisSet.mockRejectedValue(new Error("redis unavailable"));
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    expect(res.status).toBe(503);
    expect(mockDispatchStk).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/workers/dispatch-stk — reload guard", () => {
  it("no-ops when the transaction already has a checkoutRequestId (a second delivery within the claim window)", async () => {
    mockTransactionFindUnique.mockResolvedValue({ ...PENDING_ONLINE_TX, checkoutRequestId: "ws_CO_already" });
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    const json = await res.json();
    expect(json.skipped).toBeDefined();
    expect(mockDispatchStk).not.toHaveBeenCalled();
  });

  it("no-ops when the transaction is no longer PENDING", async () => {
    mockTransactionFindUnique.mockResolvedValue({ ...PENDING_ONLINE_TX, status: "SUCCESS" });
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    const json = await res.json();
    expect(json.skipped).toBeDefined();
    expect(mockDispatchStk).not.toHaveBeenCalled();
  });

  it("no-ops when the online transaction row no longer exists", async () => {
    mockTransactionFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-missing" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBeDefined();
    expect(mockDispatchStk).not.toHaveBeenCalled();
  });

  it("no-ops when the online transaction has no branchId", async () => {
    mockTransactionFindUnique.mockResolvedValue({ ...PENDING_ONLINE_TX, branchId: null });
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    const json = await res.json();
    expect(json.skipped).toBeDefined();
    expect(mockDispatchStk).not.toHaveBeenCalled();
    expect(mockBranchFindUnique).not.toHaveBeenCalled();
  });

  it("no-ops when the branch row referenced by the transaction no longer exists", async () => {
    mockTransactionFindUnique.mockResolvedValue(PENDING_ONLINE_TX);
    mockBranchFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toMatch(/branch not found/);
    expect(mockDispatchStk).not.toHaveBeenCalled();
  });

  it("no-ops when the in-store transaction already has a checkoutRequestId", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue({ ...PENDING_INSTORE_TX, checkoutRequestId: "ws_CO_already" });
    const res = await POST(makeRequest({ kind: "instore", transactionId: "tx-2" }));
    const json = await res.json();
    expect(json.skipped).toBeDefined();
    expect(mockDispatchStk).not.toHaveBeenCalled();
  });

  it("no-ops when the in-store transaction row no longer exists", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ kind: "instore", transactionId: "tx-missing" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBeDefined();
    expect(mockDispatchStk).not.toHaveBeenCalled();
  });

  it("no-ops when the in-store transaction's branch no longer exists", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue(PENDING_INSTORE_TX);
    mockBranchFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ kind: "instore", transactionId: "tx-2" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toMatch(/branch not found/);
    expect(mockDispatchStk).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/workers/dispatch-stk — unexpected errors never trigger a QStash retry", () => {
  // The claim is already held once we reach the DB lookups below, so an
  // unexpected throw here (a DB blip, a bug in dispatchStk) must still return
  // 200 — a non-2xx would make QStash redeliver into a second real STK send
  // against a transaction whose claim is already taken but whose state was
  // never finalized.
  it("returns 200 with ok:false when an unexpected error is thrown after the claim is taken", async () => {
    mockTransactionFindUnique.mockRejectedValue(new Error("DB connection reset"));
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
  });

  it("returns 200 with ok:false when finalizeStkDispatch itself throws", async () => {
    mockTransactionFindUnique.mockResolvedValue(PENDING_ONLINE_TX);
    mockFinalizeStkDispatch.mockRejectedValue(new Error("redis unavailable mid-finalize"));
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
  });
});

describe("POST /api/admin/workers/dispatch-stk — kind routing", () => {
  it("dispatches for a fresh online transaction and finalizes the result", async () => {
    mockTransactionFindUnique.mockResolvedValue(PENDING_ONLINE_TX);
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    expect(res.status).toBe(200);
    expect(mockDispatchStk).toHaveBeenCalledTimes(1);
    expect(mockDispatchStk.mock.calls[0][0]).toMatchObject({ phone: "254712345678", amountCents: 150000, kind: "online" });
    expect(mockFinalizeStkDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "online", transactionId: "tx-1", orderId: "order-1" }),
    );
  });

  it("dispatches for a fresh in-store transaction against inStoreTransaction/inStoreOrder", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue(PENDING_INSTORE_TX);
    const res = await POST(makeRequest({ kind: "instore", transactionId: "tx-2" }));
    expect(res.status).toBe(200);
    expect(mockDispatchStk).toHaveBeenCalledTimes(1);
    expect(mockDispatchStk.mock.calls[0][0]).toMatchObject({ phone: "254712345678", amountCents: 150000, kind: "instore" });
    expect(mockFinalizeStkDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "instore", transactionId: "tx-2", orderId: "instore-order-1" }),
    );
  });

  it("folds an assertGatewayEnv failure into a normal dispatch failure instead of throwing", async () => {
    mockTransactionFindUnique.mockResolvedValue(PENDING_ONLINE_TX);
    mockAssertGatewayEnv.mockImplementation(() => {
      throw new Error("KCB_BASE_URL points at a non-production host");
    });
    const res = await POST(makeRequest({ kind: "online", transactionId: "tx-1" }));
    expect(res.status).toBe(200);
    expect(mockDispatchStk).not.toHaveBeenCalled();
    expect(mockFinalizeStkDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({ success: false, reason: expect.stringMatching(/non-production host/) }),
      }),
    );
  });
});
