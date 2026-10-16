/**
 * Regression: markPaymentSuccess must be an atomic claim. Two concurrent
 * callbacks both read PENDING; only the one whose compare-and-set updates a
 * row may run side effects. The loser must not touch stock or publish anything.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const publish = vi.fn().mockResolvedValue({ messageId: "x" });
vi.mock("@/lib/qstash", () => ({ publishQstashJSON: (...a: unknown[]) => publish(...a) }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ set: vi.fn().mockResolvedValue("OK") }) }));
vi.mock("@/lib/payment-channel", () => ({ paymentChannel: (id: string) => `payment:${id}` }));
vi.mock("@/lib/orders/generate-order-number", () => ({ generateOrderNumber: vi.fn() }));
vi.mock("@/lib/zoho/push-sale-receipt", () => ({ pushSaleReceiptToZoho: vi.fn() }));
vi.mock("@/lib/zoho/resolve-org", () => ({ resolveZohoOrganizationId: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/zoho/payment-mode", () => ({ paymentModeForOnline: () => "Mpesa(KCB)" }));
vi.mock("@/lib/points/redeem", () => ({ releaseRedeemedPoints: vi.fn(), holdRedeemedPoints: vi.fn() }));
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));

const productUpdate = vi.fn();
const updateMany = vi.fn();
const findUnique = vi.fn();

vi.mock("@/lib/db", () => {
  const tx = {
    transaction: { findUnique: (...a: unknown[]) => findUnique(...a), updateMany: (...a: unknown[]) => updateMany(...a), update: vi.fn().mockResolvedValue({ mpesaReceiptNumber: "R1", paystackReference: null }) },
    order: {
      findUnique: vi.fn().mockResolvedValue({ orderNumber: "FO-1" }),
      update: vi.fn().mockResolvedValue({ id: "o1", orderNumber: "FO-1", userId: null, branchId: null, pointsRedeemed: 0, items: [{ productId: "p1", quantity: 1 }] }),
    },
    transactionEvent: { create: vi.fn() },
    product: { update: (...a: unknown[]) => productUpdate(...a) },
    cart: { findUnique: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
  };
  return { db: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx), order: { update: vi.fn() } } };
});

import { markPaymentSuccess } from "@/lib/payments/post-payment";

const args = { transactionId: "t1", orderId: "o1", transactionData: { status: "SUCCESS" as const } };

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ status: "PENDING", provider: "KCB", failureReason: null });
});

describe("markPaymentSuccess atomic claim", () => {
  it("winner decrements stock and fans out side effects", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await markPaymentSuccess(args);
    expect(productUpdate).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("/api/admin/workers/send-order-confirmation", { orderId: "o1" });
  });

  it("loser (claim count 0) touches no stock and publishes nothing", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await markPaymentSuccess(args);
    expect(productUpdate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("recovers a timeout-failed transaction but not a declined one", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({ status: "FAILED", provider: "KCB", failureReason: "Payment timed out after 5 minutes" });
    await markPaymentSuccess(args);
    expect(productUpdate).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    findUnique.mockResolvedValue({ status: "FAILED", provider: "KCB", failureReason: "1032:Request cancelled by user" });
    await markPaymentSuccess(args);
    expect(productUpdate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
