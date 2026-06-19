import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publishQstashJSON } from "@/lib/qstash";

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
      include: { items: true },
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
  });

  await publishQstashJSON("/api/admin/workers/send-order-confirmation", { orderId: args.orderId });
  await publishQstashJSON("/api/admin/workers/notify-admin-new-order", { orderId: args.orderId });
}

export async function markPaymentFailed(args: {
  transactionId: string;
  transactionData: Prisma.transactionUpdateInput;
  orderId: string;
  userId?: string | null;
}) {
  await db.$transaction([
    db.transaction.update({
      where: { id: args.transactionId },
      data: args.transactionData,
    }),
    db.order.update({
      where: { id: args.orderId },
      data: { paymentStatus: "FAILED", status: "PENDING" },
    }),
  ]);

  await publishQstashJSON(
    "/api/admin/workers/check-failed-payment",
    { orderId: args.orderId, userId: args.userId ?? null },
    { delay: 600 },
  );
}
