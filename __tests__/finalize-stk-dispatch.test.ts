/**
 * Unit tests for lib/payments/finalize-stk-dispatch.ts.
 *
 * Focus: the Redis NX guard on the `stk_sent`/`instore_stk_sent` write.
 * Found in review — without NX, a callback that resolves the payment before
 * this function's own DB writes + Redis set complete would have its terminal
 * payment_success/payment_failed event silently clobbered back to a
 * non-terminal "stk_sent", hanging the SSE stream on "Enter PIN on phone"
 * despite the order already being correctly PAID/FAILED in the DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTransactionUpdate = vi.fn().mockResolvedValue(undefined);
const mockTransactionEventCreate = vi.fn().mockResolvedValue(undefined);
const mockInStoreTransactionUpdate = vi.fn().mockResolvedValue(undefined);
const mockInStoreTransactionEventCreate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db", () => ({
  db: {
    transaction: { update: (...a: unknown[]) => mockTransactionUpdate(...a) },
    transactionEvent: { create: (...a: unknown[]) => mockTransactionEventCreate(...a) },
    inStoreTransaction: { update: (...a: unknown[]) => mockInStoreTransactionUpdate(...a) },
    inStoreTransactionEvent: { create: (...a: unknown[]) => mockInStoreTransactionEventCreate(...a) },
  },
}));

const mockRedisSet = vi.fn().mockResolvedValue("OK");
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ set: (...a: unknown[]) => mockRedisSet(...a) }),
}));

const mockPublishQstashJSON = vi.fn().mockResolvedValue({ messageId: "x" });
vi.mock("@/lib/qstash", () => ({
  publishQstashJSON: (...a: unknown[]) => mockPublishQstashJSON(...a),
}));

const mockMarkPaymentFailed = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/payments/post-payment", () => ({
  markPaymentFailed: (...a: unknown[]) => mockMarkPaymentFailed(...a),
}));

const mockMarkInStorePaymentFailed = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/payments/instore-post-payment", () => ({
  markInStorePaymentFailed: (...a: unknown[]) => mockMarkInStorePaymentFailed(...a),
}));

const mockReportError = vi.fn();
vi.mock("@/lib/observability", () => ({
  reportError: (...a: unknown[]) => mockReportError(...a),
}));

import { finalizeStkDispatch } from "@/lib/payments/finalize-stk-dispatch";

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisSet.mockResolvedValue("OK");
  mockTransactionUpdate.mockResolvedValue(undefined);
});

describe("finalizeStkDispatch — success path", () => {
  it("persists checkoutRequestId/gateway and writes stk_sent with NX for the online flow", async () => {
    await finalizeStkDispatch({
      kind: "online",
      transactionId: "tx-1",
      orderId: "order-1",
      result: { success: true, checkoutRequestId: "ws_CO_1", gatewayUsed: "KCB_BUNI" },
    });

    expect(mockTransactionUpdate).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: { checkoutRequestId: "ws_CO_1", mpesaGatewayUsed: "KCB_BUNI" },
    });
    expect(mockTransactionEventCreate).toHaveBeenCalledWith({
      data: { transactionId: "tx-1", type: "STK_SENT", detail: "KCB_BUNI" },
    });

    // The critical bit: the Redis write must use NX so a terminal event that
    // already landed at this key is never overwritten.
    const [, , opts] = mockRedisSet.mock.calls[0];
    expect(opts).toMatchObject({ nx: true });
    const [, payloadJson] = mockRedisSet.mock.calls[0];
    expect(JSON.parse(payloadJson).type).toBe("stk_sent");

    expect(mockPublishQstashJSON).toHaveBeenCalledWith(
      "/api/admin/workers/check-failed-payment",
      { orderId: "order-1", transactionId: "tx-1" },
      { delay: 5 * 60 },
    );
  });

  it("uses instore_stk_sent, inStoreTransaction, and the instore timeout worker for the in-store flow", async () => {
    await finalizeStkDispatch({
      kind: "instore",
      transactionId: "tx-2",
      orderId: "instore-order-1",
      result: { success: true, checkoutRequestId: "ws_CO_2", gatewayUsed: "DARAJA" },
    });

    expect(mockInStoreTransactionUpdate).toHaveBeenCalledWith({
      where: { id: "tx-2" },
      data: { checkoutRequestId: "ws_CO_2", mpesaGatewayUsed: "DARAJA" },
    });
    expect(mockInStoreTransactionEventCreate).toHaveBeenCalledWith({
      data: { inStoreTransactionId: "tx-2", type: "STK_SENT", detail: "DARAJA" },
    });

    const [, payloadJson, opts] = mockRedisSet.mock.calls[0];
    expect(JSON.parse(payloadJson).type).toBe("instore_stk_sent");
    expect(opts).toMatchObject({ nx: true });

    expect(mockPublishQstashJSON).toHaveBeenCalledWith(
      "/api/admin/workers/check-failed-instore-payment",
      { inStoreOrderId: "instore-order-1", transactionId: "tx-2" },
      { delay: 15 * 60 },
    );
  });

  it("does not throw when the Redis write is rejected (e.g. NX no-op or Redis down)", async () => {
    mockRedisSet.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      finalizeStkDispatch({
        kind: "online",
        transactionId: "tx-1",
        orderId: "order-1",
        result: { success: true, checkoutRequestId: "ws_CO_1", gatewayUsed: "KCB_BUNI" },
      }),
    ).resolves.toBeUndefined();
    // The DB writes and timeout scheduling must still have happened.
    expect(mockTransactionUpdate).toHaveBeenCalled();
    expect(mockPublishQstashJSON).toHaveBeenCalled();
  });
});

describe("finalizeStkDispatch — checkoutRequestId persist retry", () => {
  // A real STK prompt may already be on the customer's phone by the time
  // this runs — losing the checkoutRequestId here means the eventual
  // callback can never find this transaction again, even if the customer
  // goes on to actually pay. This is the single riskiest write in the flow.
  it("retries a transient DB failure and succeeds without escalating to Sentry", async () => {
    mockTransactionUpdate
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(undefined);

    await finalizeStkDispatch({
      kind: "online",
      transactionId: "tx-1",
      orderId: "order-1",
      result: { success: true, checkoutRequestId: "ws_CO_1", gatewayUsed: "KCB_BUNI" },
    });

    expect(mockTransactionUpdate).toHaveBeenCalledTimes(2);
    expect(mockTransactionEventCreate).toHaveBeenCalledTimes(1); // only after the successful retry
    expect(mockReportError).not.toHaveBeenCalled();
    // Still proceeds to the SSE signal and timeout scheduling.
    expect(mockRedisSet).toHaveBeenCalled();
    expect(mockPublishQstashJSON).toHaveBeenCalled();
  }, 10_000);

  it("escalates to Sentry after exhausting all attempts, does not throw, and still attempts the SSE signal and timeout scheduling", async () => {
    mockTransactionUpdate.mockRejectedValue(new Error("db is down"));

    await expect(
      finalizeStkDispatch({
        kind: "online",
        transactionId: "tx-1",
        orderId: "order-1",
        result: { success: true, checkoutRequestId: "ws_CO_1", gatewayUsed: "KCB_BUNI" },
      }),
    ).resolves.toBeUndefined();

    expect(mockTransactionUpdate).toHaveBeenCalledTimes(3); // PERSIST_ATTEMPTS
    expect(mockTransactionEventCreate).not.toHaveBeenCalled(); // never reached — update always failed first
    expect(mockReportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: "persist_checkout_request_id_exhausted" }),
        extra: expect.objectContaining({ transactionId: "tx-1", checkoutRequestId: "ws_CO_1" }),
      }),
    );
    // Still worth attempting even though the DB write never landed.
    expect(mockRedisSet).toHaveBeenCalled();
    expect(mockPublishQstashJSON).toHaveBeenCalled();
  }, 10_000);
});

describe("finalizeStkDispatch — business failure path", () => {
  it("calls markPaymentFailed with the gateway-prefixed reason for online, and never touches Redis/DB directly", async () => {
    await finalizeStkDispatch({
      kind: "online",
      transactionId: "tx-1",
      orderId: "order-1",
      result: { success: false, reason: "KCB token fetch failed: 500", gatewayAttempted: "KCB_BUNI" },
    });

    expect(mockMarkPaymentFailed).toHaveBeenCalledWith({
      transactionId: "tx-1",
      orderId: "order-1",
      reason: "KCB_BUNI: KCB token fetch failed: 500",
    });
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockPublishQstashJSON).not.toHaveBeenCalled();
  });

  it("calls markInStorePaymentFailed for the in-store flow", async () => {
    await finalizeStkDispatch({
      kind: "instore",
      transactionId: "tx-2",
      orderId: "instore-order-1",
      result: { success: false, reason: "Daraja token fetch failed: 503", gatewayAttempted: "DARAJA" },
    });

    expect(mockMarkInStorePaymentFailed).toHaveBeenCalledWith({
      transactionId: "tx-2",
      inStoreOrderId: "instore-order-1",
      reason: "DARAJA: Daraja token fetch failed: 503",
    });
  });
});
