import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { emailShell, emailSection, emailIconCircle, emailLineItem, emailTotalRow, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";

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
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const email = order.user?.email ?? order.guestEmail;
  if (email) {
    await sendOrderConfirmationEmail({ email, orderId: order.id, html: buildConfirmationHtml(order) });
  }

  return NextResponse.json({ ok: true });
}
