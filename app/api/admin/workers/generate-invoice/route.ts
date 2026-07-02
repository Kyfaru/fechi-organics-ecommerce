// Runs ~60 seconds after payment success (scheduled via Qstash delay from
// lib/payments/post-payment.ts markPaymentSuccess). Generates the branded
// invoice PDF, caches it in R2, and emails it to the customer as a separate,
// quieter follow-up to the instant order-confirmation email.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { getOrCreateInvoice } from "@/lib/invoice/get-or-create-invoice";
import { sendInvoiceEmail } from "@/lib/email";

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { orderId } = JSON.parse(rawBody) as { orderId: string };
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, totalKes: true, receiptSent: true, user: { select: { email: true } }, guestEmail: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.receiptSent) return NextResponse.json({ ok: true, skipped: true });

  const invoice = await getOrCreateInvoice(orderId);
  if (!invoice) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const email = order.user?.email ?? order.guestEmail;
  if (email) {
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1a1c1c;">
        <h2 style="color:#27731e;">Your invoice is ready</h2>
        <p>Invoice ${invoice.invoiceNumber} for your Fechi Organics order — total paid <strong>${kes(order.totalKes)}</strong>.</p>
        <p>It's attached as a PDF, or you can view it anytime here: <a href="${invoice.url}">${invoice.url}</a></p>
      </div>
    `;
    await sendInvoiceEmail({ email, orderId: order.id, invoiceNumber: invoice.invoiceNumber, html, pdfBuffer: invoice.buffer });
  }

  await db.order.update({ where: { id: order.id }, data: { receiptSent: true } });
  return NextResponse.json({ ok: true });
}
