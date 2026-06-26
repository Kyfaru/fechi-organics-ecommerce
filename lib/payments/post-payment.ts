import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publishQstashJSON } from "@/lib/qstash";
import { getRedis } from "@/lib/redis";
import { paymentChannel } from "@/lib/payment-channel";

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

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

    const order = await tx.order.update({
      where: { id: args.orderId },
      data: { paymentStatus: "PAID", status: "CONFIRMED" },
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
  // Delete transaction first (no cascade from order), then order (cascades to items/events)
  await db.$transaction([
    db.transaction.deleteMany({ where: { orderId: args.orderId } }),
    db.order.delete({ where: { id: args.orderId } }),
  ]);

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
