/**
 * POST /api/admin/orders/instore/[id]/send-receipt
 *
 * Sends (or schedules) the invoice receipt for an in-store order to the
 * walk-in customer, via email, SMS, or both. Admin-only.
 *
 * "both" is the fire-and-forget path used when the admin dismisses the
 * success modal (X/Cancel): email sends synchronously if an address is on
 * file, SMS is scheduled on Qstash so the request returns fast instead of
 * waiting on Twilio.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { getOrCreateInStoreInvoice } from "@/lib/invoice/get-or-create-instore-invoice";
import { createInstoreInvoiceToken } from "@/lib/invoice-token";
import { sendInvoiceEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { publishQstashJSON } from "@/lib/qstash";

// Fire-and-forget "both" path shouldn't block the request on Twilio — same
// short delay used by the campaign "send later" window.
const SMS_SCHEDULE_DELAY_SECONDS = 600;

const bodySchema = z.object({ channel: z.enum(["email", "sms", "both"]) }).strict();

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  return user?.role === "admin" ? user : null;
}

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function buildInvoiceEmailHtml(args: { invoiceNumber: string; totalKes: number; url: string }) {
  return `
    <div style="font-family:Arial,sans-serif;color:#1a1c1c;">
      <h2 style="color:#27731e;">Your invoice is ready</h2>
      <p>Invoice ${args.invoiceNumber} for your Fechi Organics in-store purchase — total paid <strong>${kes(args.totalKes)}</strong>.</p>
      <p>It's attached as a PDF, or you can view it anytime here: <a href="${args.url}">${args.url}</a></p>
    </div>
  `;
}

function buildSmsMessage(args: { invoiceNumber: string; orderNumber: string | null; url: string }) {
  return `Fechi Organics — your invoice ${args.invoiceNumber} for order ${args.orderNumber} is ready: ${args.url}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  const { id } = await params;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Err.validation("Invalid request body");
  }
  const { channel } = parsed;

  try {
    const order = await db.inStoreOrder.findUnique({ where: { id } });
    if (!order) return Err.notFound("Order");

    // Should already be cached from the payment-success path, but call it
    // anyway rather than assuming that pre-warm succeeded.
    const invoice = await getOrCreateInStoreInvoice(id);
    if (!invoice) return Err.notFound("Order");

    if (channel === "email") {
      if (!order.customerEmail) {
        return err("NO_EMAIL", "No email address on file for this order", 400);
      }
      const html = buildInvoiceEmailHtml({ invoiceNumber: invoice.invoiceNumber, totalKes: order.totalKes, url: invoice.url });
      await sendInvoiceEmail({ email: order.customerEmail, orderId: order.id, invoiceNumber: invoice.invoiceNumber, html, pdfBuffer: invoice.buffer });
      await db.inStoreOrder.update({ where: { id }, data: { receiptSentEmail: true } });
      return ok({ sent: ["email"] });
    }

    if (channel === "sms") {
      if (!order.customerPhone) {
        return err("NO_PHONE", "No phone number on file for this order", 400);
      }
      const token = await createInstoreInvoiceToken(id);
      const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/invoices/instore/${token}`;
      await sendSms(order.customerPhone, buildSmsMessage({ invoiceNumber: invoice.invoiceNumber, orderNumber: order.orderNumber, url }));
      await db.inStoreOrder.update({ where: { id }, data: { receiptSentSms: true } });
      return ok({ sent: ["sms"] });
    }

    // channel === "both" — email now (best-effort, skip silently if it fails
    // or there's no address), SMS scheduled so the request returns fast.
    const sent: string[] = [];

    if (order.customerEmail) {
      try {
        const html = buildInvoiceEmailHtml({ invoiceNumber: invoice.invoiceNumber, totalKes: order.totalKes, url: invoice.url });
        await sendInvoiceEmail({ email: order.customerEmail, orderId: order.id, invoiceNumber: invoice.invoiceNumber, html, pdfBuffer: invoice.buffer });
        await db.inStoreOrder.update({ where: { id }, data: { receiptSentEmail: true } });
        sent.push("email");
      } catch (e) {
        console.error("[instore/send-receipt] email send failed:", e);
      }
    }

    let smsScheduled = false;
    if (order.customerPhone) {
      try {
        await publishQstashJSON(
          "/api/admin/workers/send-instore-sms-receipt",
          { inStoreOrderId: id },
          { delay: SMS_SCHEDULE_DELAY_SECONDS },
        );
        smsScheduled = true;
      } catch (e) {
        console.error("[instore/send-receipt] SMS scheduling failed:", e);
      }
    }

    return ok({ sent, smsScheduled });
  } catch (e) {
    console.error("[instore/send-receipt] POST error", e);
    return Err.internal(e);
  }
}
