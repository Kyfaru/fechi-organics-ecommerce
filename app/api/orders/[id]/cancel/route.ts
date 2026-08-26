import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { reportError } from "@/lib/observability";

// Mirrors app/api/admin/orders/[id]/route.ts's "cancel" action — same
// cancellable-status window, same customer notification shape — but scoped
// to the order's own owner instead of admin/staff permissions.
const CANCELLABLE_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "WAITING_TO_PACKAGE"];

function notifyCancelled(orderId: string, userId: string, orderRef: string, phone?: string | null, phoneCode?: string | null) {
  const body = `Hi! Your Fechi Organics order ${orderRef} has been cancelled.`;
  // fire-and-forget — don't block the response
  Promise.resolve().then(async () => {
    try {
      await db.inboxMessage.create({
        data: { userId, type: "SYSTEM", title: `Order ${orderRef} — CANCELLED`, body, orderId },
      });
    } catch (e) {
      reportError(e, { route: "POST /api/orders/[id]/cancel", tags: { domain: "orders", stage: "notify-inbox" } });
      console.error("[notify] inbox failed:", e);
    }
    const smsPhone = phone ? combineLegacyPhone(phone, phoneCode ?? null) : null;
    if (hasSmsConfig() && smsPhone) {
      try {
        await sendSms(smsPhone, body);
      } catch (e) {
        reportError(e, { route: "POST /api/orders/[id]/cancel", tags: { domain: "orders", stage: "notify-sms" } });
        console.error("[notify] SMS failed:", e);
      }
    }
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        orderNumber: true,
        user: { select: { phone: true, phoneCode: true } },
      },
    });
    if (!order) return Err.notFound("Order");
    if (order.userId !== session.user.id) return Err.forbidden();

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      return Err.validation("This order can no longer be cancelled — please contact us instead");
    }

    const updated = await db.order.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await db.orderStatusEvent.create({ data: { orderId: id, status: "CANCELLED", occurredAt: new Date() } });

    const orderRef = order.orderNumber ?? `#FO-${id.slice(0, 8).toUpperCase()}`;
    notifyCancelled(id, order.userId, orderRef, order.user?.phone, order.user?.phoneCode);
    console.info("[orders/[id]/cancel] cancelled by customer —", id);

    return ok({ order: updated });
  } catch (e) {
    console.error("[orders/[id]/cancel] error", e);
    reportError(e, { route: "POST /api/orders/[id]/cancel" });
    return Err.internal();
  }
}
