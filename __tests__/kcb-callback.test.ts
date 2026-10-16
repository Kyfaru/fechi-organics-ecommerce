/**
 * app/api/payments/kcb/callback/route.ts — ack-first handler.
 * Covers: success, paid-amount mismatch (never auto-confirmed), duplicate,
 * unknown ref, signed tx-hint fallback, late success on a FAILED tx, failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const markPaymentSuccess = vi.fn().mockResolvedValue(undefined);
const markPaymentFailed = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/payments/post-payment", () => ({
  markPaymentSuccess: (...a: unknown[]) => markPaymentSuccess(...a),
  markPaymentFailed: (...a: unknown[]) => markPaymentFailed(...a),
}));

const createNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notify", () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/observability-server", () => ({ trackServerEvent: vi.fn(), logServerError: vi.fn() }));

const findFirst = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    transaction: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

// Inbox writes aren't under test — keep inert but keep the real signature/amount logic.
const settleCallback = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/payments/callback-guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/payments/callback-guard")>()),
  fileCallback: async () => ({ id: "inbox-1", duplicate: false }),
  settleCallback: (...a: unknown[]) => settleCallback(...a),
}));

import { POST } from "@/app/api/payments/kcb/callback/route";
import { signTx } from "@/lib/payments/callback-guard";

const TX = (over: Record<string, unknown> = {}) => ({
  id: "tx-1",
  orderId: "order-12345678",
  status: "PENDING",
  amount: 150000,
  order: { userId: "u1", branchId: "b1", guestEmail: null, user: { name: "Jane" } },
  ...over,
});

const body = (o: { code?: number; amount?: number | null; id?: string } = {}) => ({
  Body: {
    stkCallback: {
      MerchantRequestID: "m1",
      CheckoutRequestID: o.id ?? "ws_CO_1",
      ResultCode: o.code ?? 0,
      ResultDesc: o.code ? "Request cancelled by user" : "The service request is processed successfully.",
      ...((o.code ?? 0) === 0 && {
        CallbackMetadata: {
          Item: [
            ...(o.amount === null ? [] : [{ Name: "Amount", Value: o.amount ?? 1500 }]),
            { Name: "MpesaReceiptNumber", Value: "QAB123" },
          ],
        },
      }),
    },
  },
});

const req = (b: unknown, qs = "") =>
  new NextRequest(`http://localhost/api/payments/kcb/callback${qs}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PAYMENT_CALLBACK_SECRET = "test-secret";
  delete process.env.PAYMENT_CALLBACK_ENFORCE_SIG;
});

describe("POST /api/payments/kcb/callback", () => {
  it("marks a matching success paid and settles the inbox row 'processed'", async () => {
    findFirst.mockResolvedValue(TX());
    const res = await POST(req(body()));
    expect(await res.json()).toMatchObject({ ResultCode: 0 });
    expect(markPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "tx-1",
        transactionData: expect.objectContaining({ mpesaReceiptNumber: "QAB123" }),
      }),
    );
    expect(settleCallback).toHaveBeenCalledWith("inbox-1", "processed");
  });

  it("never auto-confirms a real amount mismatch; notifies admins", async () => {
    findFirst.mockResolvedValue(TX());
    await POST(req(body({ amount: 1 })));
    expect(markPaymentSuccess).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "PAYMENT_ERROR" }));
    expect(settleCallback).toHaveBeenCalledWith("inbox-1", "amount_mismatch");
  });

  it("accepts the whole-KES rounding of a sub-KES order (85 cents paid as KES 1)", async () => {
    findFirst.mockResolvedValue(TX({ amount: 85 }));
    await POST(req(body({ amount: 1 })));
    expect(markPaymentSuccess).toHaveBeenCalled();
  });

  it("does not reject a callback that carries no Amount item", async () => {
    findFirst.mockResolvedValue(TX());
    await POST(req(body({ amount: null })));
    expect(markPaymentSuccess).toHaveBeenCalled();
  });

  it("ignores a duplicate for an already-SUCCESS transaction", async () => {
    findFirst.mockResolvedValue(TX({ status: "SUCCESS" }));
    await POST(req(body()));
    expect(markPaymentSuccess).not.toHaveBeenCalled();
    expect(settleCallback).toHaveBeenCalledWith("inbox-1", "duplicate");
  });

  it("lets a success through for a FAILED transaction (late-payment recovery decides)", async () => {
    findFirst.mockResolvedValue(TX({ status: "FAILED" }));
    await POST(req(body()));
    expect(markPaymentSuccess).toHaveBeenCalled();
  });

  it("acks and records an unknown CheckoutRequestID without processing", async () => {
    findFirst.mockResolvedValue(null);
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    expect(markPaymentSuccess).not.toHaveBeenCalled();
    expect(settleCallback).toHaveBeenCalledWith("inbox-1", "unknown_ref");
  });

  it("falls back to the signed ?tx= id when the checkoutRequestId isn't persisted yet", async () => {
    findFirst.mockResolvedValue(null);
    findUnique.mockResolvedValue(TX());
    await POST(req(body(), `?tx=tx-1&sig=${signTx("tx-1")}`));
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "tx-1" } }));
    expect(markPaymentSuccess).toHaveBeenCalled();
  });

  it("does NOT use a ?tx= fallback when the signature is forged", async () => {
    findFirst.mockResolvedValue(null);
    await POST(req(body(), `?tx=tx-1&sig=${"0".repeat(32)}`));
    expect(findUnique).not.toHaveBeenCalled();
    expect(markPaymentSuccess).not.toHaveBeenCalled();
  });

  it("rejects a forged signature only when enforcement is on", async () => {
    findFirst.mockResolvedValue(TX());
    process.env.PAYMENT_CALLBACK_ENFORCE_SIG = "1";
    await POST(req(body(), `?tx=tx-1&sig=${"0".repeat(32)}`));
    expect(markPaymentSuccess).not.toHaveBeenCalled();
    expect(settleCallback).toHaveBeenCalledWith("inbox-1", "rejected_signature");
  });

  it("marks failed and notifies on a cancelled prompt (1032)", async () => {
    findFirst.mockResolvedValue(TX());
    await POST(req(body({ code: 1032 })));
    expect(markPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringContaining("1032") }),
    );
    expect(markPaymentSuccess).not.toHaveBeenCalled();
  });
});
