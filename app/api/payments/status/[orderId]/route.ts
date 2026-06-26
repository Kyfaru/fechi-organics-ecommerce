// Called by the payment page when the SSE stream times out with no callback.
// Deletes the still-PENDING order so it doesn't linger in the DB.
// GET (polling) has been removed — use GET /api/payments/stream for SSE-based status.

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { markPaymentFailed } from "@/lib/payments/post-payment";
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const { orderId } = await params;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, paymentStatus: true },
    });

    if (!order || order.userId !== session.user.id) return ok({ deleted: false });
    if (order.paymentStatus !== "PENDING") return ok({ deleted: false });

    const tx = await db.transaction.findFirst({ where: { orderId }, select: { id: true } });
    if (tx) await markPaymentFailed({ transactionId: tx.id, orderId });
    else await db.order.delete({ where: { id: orderId } });

    return ok({ deleted: true });
  } catch (e) {
    console.error("[payments/status] DELETE error", e);
    return Err.internal();
  }
}
