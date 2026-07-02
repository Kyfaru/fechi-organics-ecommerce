import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { sendOrderConfirmationEmail } from "@/lib/email";

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function buildConfirmationHtml(order: { id: string; createdAt: Date; totalKes: number; items: { name: string; quantity: number }[] }) {
  return `
    <div style="font-family:Arial,sans-serif;color:#1a1c1c;">
      <h2 style="color:#27731e;">Thanks for your order!</h2>
      <p>Order #${order.id.slice(0, 8).toUpperCase()} placed on ${order.createdAt.toLocaleString("en-KE")} is confirmed.</p>
      <p>${order.items.map((i) => `${i.name} x ${i.quantity}`).join("<br/>")}</p>
      <p>Total paid: <strong>${kes(order.totalKes)}</strong></p>
      <p style="color:#666;font-size:13px;">Your invoice will follow shortly in a separate email.</p>
    </div>
  `;
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
