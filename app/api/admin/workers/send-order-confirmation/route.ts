import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { r2Client, r2PublicUrl } from "@/lib/r2";
import { verifyQstashRequest } from "@/lib/qstash";
import { buildReceiptSummaryHtml, renderReceiptPdfBuffer } from "@/lib/pdf/OrderReceiptDocument";
import { sendOrderConfirmationEmail } from "@/lib/email";

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
  if (order.receiptSent) return NextResponse.json({ ok: true, skipped: true });

  const pdfBuffer = renderReceiptPdfBuffer(order);
  const objectKey = `receipts/${order.id}.pdf`;
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: objectKey,
    Body: pdfBuffer,
    ContentType: "application/pdf",
  }));

  const html = `${buildReceiptSummaryHtml(order)}<p><a href="${r2PublicUrl(objectKey)}">Download your receipt</a></p>`;
  const email = order.user?.email ?? order.guestEmail;
  if (email) {
    await sendOrderConfirmationEmail({ email, orderId: order.id, html, pdfBuffer });
  }

  await db.order.update({ where: { id: order.id }, data: { receiptSent: true } });
  return NextResponse.json({ ok: true });
}
