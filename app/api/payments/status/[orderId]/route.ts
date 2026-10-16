// Called by the payment page when the SSE stream times out with no callback.
// Flips the still-PENDING order to FAILED so it doesn't linger in the DB as PENDING
// (failed orders are kept, not deleted, so they remain visible in order history).
// GET returns just the payment status — the browser's fallback when the SSE
// stream drops, so a dropped connection never has to be shown as a failure.

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { markPaymentFailed } from "@/lib/payments/post-payment";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  if (!orderId || orderId.length < 10) return Err.validation("Invalid order id");
  // The unguessable order id is the ownership proof (same model as the SSE
  // stream); only the coarse status is returned.
  const order = await db.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } });
  if (!order) return Err.notFound("Order");
  return ok({ paymentStatus: order.paymentStatus });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  // Session is optional — a guest has no session to check, and the orderId
  // itself (an unguessable UUID handed only to the browser that placed the
  // order) is the ownership proof, same as GET /api/payments/stream.
  const session = await auth.api.getSession({ headers: await headers() });

  const { orderId } = await params;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, paymentStatus: true },
    });

    if (!order || (session?.user && order.userId !== session.user.id)) return ok({ deleted: false });
    if (order.paymentStatus !== "PENDING") return ok({ deleted: false });

    const tx = await db.transaction.findFirst({ where: { orderId }, select: { id: true } });
    if (tx) await markPaymentFailed({ transactionId: tx.id, orderId, reason: "Payment timed out waiting for confirmation" });
    else await db.order.update({ where: { id: orderId }, data: { status: "FAILED", paymentStatus: "FAILED" } });

    return ok({ deleted: true });
  } catch (e) {
    reportError(e, {
      route: "DELETE /api/payments/status/[orderId]",
      userId: session?.user?.id,
      tags: { stage: "handler" },
      extra: { orderId },
    });
    console.error("[payments/status] DELETE error", e);
    return Err.internal();
  }
}
