// Runs ~60 seconds after payment success (scheduled via Qstash delay from
// lib/payments/post-payment.ts markPaymentSuccess). Generates the branded
// invoice PDF, caches it in R2, and emails it to the customer as a separate,
// quieter follow-up to the instant order-confirmation email.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { getOrCreateInvoice } from "@/lib/invoice/get-or-create-invoice";
import { sendInvoiceEmail } from "@/lib/email";
import { emailShell, emailSection, emailButton, emailIconCircle, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";

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
    const sections = [
      emailSection(`
        ${emailIconCircle("receipt")}
        <h1 style="margin:0 0 16px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">Your Invoice Is Ready</h1>
        <p style="margin:0 0 28px;text-align:center;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">
          Invoice <strong>${invoice.invoiceNumber}</strong> for your Fechi Organics order — total paid <strong>${kes(order.totalKes)}</strong>. It's attached as a PDF.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td>${emailButton("View Invoice", invoice.url)}</td></tr></table>
      `),
    ].join("");
    const html = emailShell({ title: "Your Invoice Is Ready", sectionsHtml: sections });
    await sendInvoiceEmail({ email, orderId: order.id, invoiceNumber: invoice.invoiceNumber, html, pdfBuffer: invoice.buffer });
  }

  await db.order.update({ where: { id: order.id }, data: { receiptSent: true } });
  return NextResponse.json({ ok: true });
}
