// Qstash-triggered worker for the "both" channel's SMS leg of
// POST /api/admin/orders/instore/[id]/send-receipt — scheduled with a short
// delay so the admin's request returns immediately instead of waiting on
// Twilio.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { getOrCreateInStoreInvoice } from "@/lib/invoice/get-or-create-instore-invoice";
import { createInstoreInvoiceToken } from "@/lib/invoice-token";
import { sendSms } from "@/lib/sms";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { inStoreOrderId } = JSON.parse(rawBody) as { inStoreOrderId: string };
  const order = await db.inStoreOrder.findUnique({ where: { id: inStoreOrderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Idempotency — Qstash can redeliver, and there's nothing to do if the
  // customer never gave a phone number.
  if (order.receiptSentSms || !order.customerPhone) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const invoice = await getOrCreateInStoreInvoice(inStoreOrderId);
  if (!invoice) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const token = await createInstoreInvoiceToken(inStoreOrderId);
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/invoices/instore/${token}`;
  await sendSms(
    order.customerPhone,
    `Fechi Organics — your invoice ${invoice.invoiceNumber} for order ${order.orderNumber} is ready: ${url}`,
  );

  await db.inStoreOrder.update({ where: { id: inStoreOrderId }, data: { receiptSentSms: true } });
  return NextResponse.json({ ok: true });
}
