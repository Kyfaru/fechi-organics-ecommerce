import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { emailShell, emailSection, emailIconCircle, emailLineItem, emailTotalRow, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";
import { reportError } from "@/lib/observability";
import { trackServerEvent } from "@/lib/observability-server";
import { sendSms, hasSmsConfig } from "@/lib/sms";

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function buildConfirmationHtml(order: { id: string; createdAt: Date; totalKes: number; items: { name: string; quantity: number }[] }) {
  const sections = [
    emailSection(`
      ${emailIconCircle("check")}
      <h1 style="margin:0 0 8px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">Thanks for Your Order!</h1>
      <p style="margin:0 0 28px;text-align:center;font-size:14px;color:${EMAIL_BRAND.textMuted};">
        Order #${order.id.slice(0, 8).toUpperCase()} · placed ${order.createdAt.toLocaleString("en-KE")}
      </p>
      ${order.items.map((i) => emailLineItem(i.name, undefined, `Qty: ${i.quantity}`)).join("")}
      <div style="margin-top:16px;">${emailTotalRow("Total paid", kes(order.totalKes), true)}</div>
      <p style="margin:28px 0 0;font-size:13px;color:${EMAIL_BRAND.textMuted};text-align:center;">Your invoice will follow shortly in a separate email.</p>
    `),
  ].join("");

  return emailShell({ title: "Order Confirmed", sectionsHtml: sections });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { orderId } = JSON.parse(rawBody) as { orderId: string };

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: { select: { email: true } } },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const email = order.user?.email ?? order.guestEmail;
    if (email) {
      await sendOrderConfirmationEmail({ email, orderId: order.id, html: buildConfirmationHtml(order) });
    }

    // Online orders never got an automatic SMS confirmation (only the manual
    // in-store "send receipt" action sends one) — send one here, queued via
    // this same Qstash worker so it never blocks the payment response.
    if (hasSmsConfig() && order.deliveryPhone) {
      try {
        const orderRef = order.orderNumber ?? `#FO-${order.id.slice(0, 8).toUpperCase()}`;
        await sendSms(
          order.deliveryPhone,
          `Hi! Your Fechi Organics order ${orderRef} was received — total ${kes(order.totalKes)}. We'll notify you when it ships or is ready for pickup.`,
        );
      } catch (e) {
        reportError(e, { route: "POST /api/admin/workers/send-order-confirmation", tags: { stage: "sms" }, extra: { orderId } });
        console.error("[send-order-confirmation] SMS failed:", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    reportError(error, { route: "POST /api/admin/workers/send-order-confirmation", extra: { orderId } });
    trackServerEvent("system", "send_order_confirmation_worker_failed", { orderId });
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
