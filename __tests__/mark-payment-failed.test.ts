/**
 * Regression test for lib/payments/post-payment.ts's markPaymentFailed():
 * it must persist the failure reason onto transaction.failureReason, not
 * just orderStatusEvent.note — the column exists and callers already
 * compute the reason, but it was previously silently discarded, leaving the
 * payment-failed order detail page (app/admin/(protected)/orders/
 * payment-failed/[token]/page.tsx) with no real reason to show for actual
 * declines.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis", () => ({ getRedis: () => ({ set: vi.fn() }) }));
vi.mock("@/lib/payment-channel", () => ({ paymentChannel: (id: string) => `payment:${id}` }));

const mockDb = vi.hoisted(() => {
  const db: Record<string, unknown> = {
    transaction: {
      findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
      update: vi.fn(),
    },
    order: { update: vi.fn() },
    orderStatusEvent: { create: vi.fn() },
  };
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return db;
});
vi.mock("@/lib/db", () => ({ db: mockDb }));

import { markPaymentFailed } from "@/lib/payments/post-payment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = mockDb as any;

beforeEach(() => vi.clearAllMocks());

describe("markPaymentFailed", () => {
  it("writes the reason to transaction.failureReason (not just orderStatusEvent.note)", async () => {
    db.transaction.findUnique.mockResolvedValue({ status: "PENDING" });

    await markPaymentFailed({ transactionId: "tx-1", orderId: "order-1", reason: "1032:Request cancelled by user" });

    expect(db.transaction.update).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: { status: "FAILED", failureReason: "1032:Request cancelled by user" },
    });
    expect(db.orderStatusEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: "order-1", status: "FAILED", note: "1032:Request cancelled by user" }),
    });
  });

  it("writes null failureReason when no reason is given", async () => {
    db.transaction.findUnique.mockResolvedValue({ status: "PENDING" });

    await markPaymentFailed({ transactionId: "tx-1", orderId: "order-1" });

    expect(db.transaction.update).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: { status: "FAILED", failureReason: null },
    });
  });

  it("is a no-op when the transaction isn't PENDING (idempotency guard)", async () => {
    db.transaction.findUnique.mockResolvedValue({ status: "FAILED" });

    await markPaymentFailed({ transactionId: "tx-1", orderId: "order-1", reason: "late callback" });

    expect(db.transaction.update).not.toHaveBeenCalled();
  });
});
