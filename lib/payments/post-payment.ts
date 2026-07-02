import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publishQstashJSON } from "@/lib/qstash";
import { getRedis } from "@/lib/redis";
import { paymentChannel } from "@/lib/payment-channel";
import { generateOrderNumber, type TxClient } from "@/lib/orders/generate-order-number";

export async function markPaymentSuccess(args: {
  transactionId: string;
  transactionData: Prisma.transactionUpdateInput;
  orderId: string;
}) {
  await db.$transaction(async (tx: TxClient) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: args.transactionId },
      select: { status: true },
    });
    if (!transaction || transaction.status !== "PENDING") return;

    // Orders created via mpesa/paystack initiate don't have an orderNumber yet
    // (it used to be assigned only on manual admin confirmation) — assign one
    // now, the instant payment succeeds, so it's ready as soon as the order is.
    const existing = await tx.order.findUnique({
      where: { id: args.orderId },
      select: { orderNumber: true },
    });
    const orderNumber = existing?.orderNumber ?? (await generateOrderNumber(tx));

    const order = await tx.order.update({
      where: { id: args.orderId },
      data: { paymentStatus: "PAID", status: "CONFIRMED", orderNumber },
      include: { items: true, user: { select: { id: true } } },
    });

    await tx.transaction.update({
      where: { id: args.transactionId },
      data: args.transactionData,
    });

    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    if (order.userId) {
      const cart = await tx.cart.findUnique({ where: { userId: order.userId } });
      if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
  });

  await publishQstashJSON("/api/admin/workers/send-order-confirmation", { orderId: args.orderId });
  await publishQstashJSON("/api/admin/workers/notify-admin-new-order", { orderId: args.orderId });
  // Invoice PDF + email follow ~1 minute later, as a separate, quieter
  // background step after the instant confirmation email above.
  await publishQstashJSON("/api/admin/workers/generate-invoice", { orderId: args.orderId }, { delay: 60 });

  // Notify waiting SSE stream — must not throw if Redis is unavailable
  try {
    await getRedis().set(
      paymentChannel(args.orderId),
      JSON.stringify({ type: "payment_success", orderId: args.orderId, transactionId: args.transactionId, timestamp: Date.now() }),
      { ex: 900 }
    );
  } catch (e) {
    console.error("[post-payment] Redis set failed (success):", e);
  }
}

export async function markPaymentFailed(args: {
  transactionId: string;
  orderId: string;
  reason?: string;
}) {
  await db.$transaction(async (tx: TxClient) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: args.transactionId },
      select: { status: true },
    });
    // Idempotency guard: a late timeout job can fire after the payment already
    // succeeded (or already failed) via callback — don't clobber that outcome.
    if (!transaction || transaction.status !== "PENDING") return;

    await tx.transaction.update({
      where: { id: args.transactionId },
      data: { status: "FAILED" },
    });

    await tx.order.update({
      where: { id: args.orderId },
      data: { status: "FAILED", paymentStatus: "FAILED" },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: args.orderId,
        status: "FAILED",
        occurredAt: new Date(),
        note: args.reason ?? null,
      },
    });
  });

  // Notify waiting SSE stream — must not throw if Redis is unavailable
  try {
    await getRedis().set(
      paymentChannel(args.orderId),
      JSON.stringify({ type: "payment_failed", orderId: args.orderId, reason: args.reason, timestamp: Date.now() }),
      { ex: 900 }
    );
  } catch (e) {
    console.error("[post-payment] Redis set failed (failed):", e);
  }
}
