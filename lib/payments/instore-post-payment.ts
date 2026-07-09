/**
 * Post-payment side effects for in-store orders — mirrors
 * lib/payments/post-payment.ts's shape (idempotent success/failure
 * transitions + best-effort Redis signal) but targets the inStore* tables
 * and is deliberately independent of that file (it must not be imported
 * from or modified — it powers the customer checkout flow).
 *
 * Why it exists: both the STK-push callback and the C2B claim flow need the
 * exact same idempotency-guarded "mark paid, decrement stock, signal" logic,
 * so it lives here once instead of being duplicated across callers.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { paymentChannel } from "@/lib/payment-channel";
import { getOrCreateInStoreInvoice } from "@/lib/invoice/get-or-create-instore-invoice";

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Marks an in-store transaction (and its order) as paid, decrements stock
 * for the order's items, and best-effort signals the payment channel.
 *
 * @param args.transactionId - inStoreTransaction id to update
 * @param args.inStoreOrderId - inStoreOrder id whose paymentStatus flips to PAID
 * @param args.transactionData - Prisma update payload applied to the transaction row
 *
 * Idempotency: only transactions still PENDING are processed — a late
 * callback racing an already-claimed C2B match (or a duplicate webhook)
 * returns early without double-decrementing stock.
 */
export async function markInStorePaymentSuccess(args: {
  transactionId: string;
  inStoreOrderId: string;
  transactionData: Prisma.inStoreTransactionUpdateInput;
}): Promise<void> {
  await db.$transaction(async (tx: TxClient) => {
    const transaction = await tx.inStoreTransaction.findUnique({
      where: { id: args.transactionId },
      select: { status: true },
    });
    if (!transaction || transaction.status !== "PENDING") return;

    await tx.inStoreTransaction.update({
      where: { id: args.transactionId },
      data: args.transactionData,
    });

    await tx.inStoreOrder.update({
      where: { id: args.inStoreOrderId },
      data: { paymentStatus: "PAID" },
    });

    const items = await tx.inStoreOrderItem.findMany({
      where: { inStoreOrderId: args.inStoreOrderId },
      select: { productId: true, quantity: true },
    });
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }
  });

  // Pre-warm the invoice PDF synchronously (not queued, unlike the customer
  // flow's 60s-delayed worker) so it's already cached in R2 by the time the
  // admin's success modal renders a Send button. A render/upload failure here
  // must never fail the payment-success path — Send-receipt will just
  // generate it lazily on demand instead.
  try {
    await getOrCreateInStoreInvoice(args.inStoreOrderId);
  } catch (e) {
    console.error("[instore-post-payment] Invoice pre-generation failed (success):", e);
  }

  // Forward-compatible groundwork for a later phase's waiting-modal SSE
  // stream — must never throw if Redis is unavailable.
  try {
    await getRedis().set(
      paymentChannel(args.inStoreOrderId),
      JSON.stringify({
        type: "instore_payment_success",
        inStoreOrderId: args.inStoreOrderId,
        transactionId: args.transactionId,
        timestamp: Date.now(),
      }),
      { ex: 900 },
    );
  } catch (e) {
    console.error("[instore-post-payment] Redis set failed (success):", e);
  }
}

/**
 * Marks an in-store transaction (and its order) as failed.
 *
 * @param args.transactionId - inStoreTransaction id to update
 * @param args.inStoreOrderId - inStoreOrder id whose paymentStatus flips to FAILED
 * @param args.reason - optional human-readable failure reason, stored on the transaction
 *
 * Idempotency: same PENDING-only guard as markInStorePaymentSuccess — a late
 * failure callback can never clobber an already-successful payment.
 */
export async function markInStorePaymentFailed(args: {
  transactionId: string;
  inStoreOrderId: string;
  reason?: string;
}): Promise<void> {
  await db.$transaction(async (tx: TxClient) => {
    const transaction = await tx.inStoreTransaction.findUnique({
      where: { id: args.transactionId },
      select: { status: true },
    });
    if (!transaction || transaction.status !== "PENDING") return;

    await tx.inStoreTransaction.update({
      where: { id: args.transactionId },
      data: { status: "FAILED", failureReason: args.reason ?? null },
    });

    await tx.inStoreOrder.update({
      where: { id: args.inStoreOrderId },
      data: { paymentStatus: "FAILED" },
    });
  });

  try {
    await getRedis().set(
      paymentChannel(args.inStoreOrderId),
      JSON.stringify({
        type: "instore_payment_failed",
        inStoreOrderId: args.inStoreOrderId,
        transactionId: args.transactionId,
        reason: args.reason,
        timestamp: Date.now(),
      }),
      { ex: 900 },
    );
  } catch (e) {
    console.error("[instore-post-payment] Redis set failed (failed):", e);
  }
}
