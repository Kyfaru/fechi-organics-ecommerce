import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  // Session is optional — see the matching comment in ../receipt/route.ts.
  const session = await auth.api.getSession({ headers: req.headers });

  const { id: orderId } = await params;

  const order = await db.order.findFirst({
    where: session?.user ? { id: orderId, userId: session.user.id } : { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      totalKes: true,
      userId: true,
      user: { select: { name: true } },
    },
  });
  if (!order?.userId) return Err.notFound("Order");

  const shortRef = order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`;
  const totalStr = `KES ${(order.totalKes / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
  const firstName = order.user?.name?.split(" ")[0] ?? "there";

  const messageBody =
    `Hi ${firstName}! Order ${shortRef} confirmed ✓\n` +
    `Total: ${totalStr}\n` +
    `Estimated delivery: 1-3 business days\n` +
    `Thank you for shopping with Fechi Organics!`;

  // 1. In-app inbox (idempotent — skip if message already exists for this order)
  let inboxOk = false;
  try {
    const existing = await db.inboxMessage.findFirst({
      where: { orderId, userId: order.userId },
    });
    if (!existing) {
      await db.inboxMessage.create({
        data: {
          userId: order.userId,
          type: "SYSTEM",
          title: `Order ${shortRef} Confirmed`,
          body: messageBody,
          orderId,
        },
      });
    }
    inboxOk = true;
  } catch (e) {
    reportError(e, { route: "POST /api/orders/[id]/notify", extra: { orderId } });
    console.error("[notify] inbox create failed:", e);
  }

  // SMS for order confirmation is sent server-side from markPaymentSuccess()
  // (queued via the send-order-confirmation Qstash worker) — not from here.
  // That path fires the instant payment succeeds regardless of whether the
  // customer's browser ever reaches this success page, and sending it again
  // here too would double-text the customer. smsOk stays true so the client
  // doesn't show a spurious "could not send confirmation" error for a leg
  // that was never this endpoint's job to run.
  return ok({ inboxOk, smsOk: true });
}
