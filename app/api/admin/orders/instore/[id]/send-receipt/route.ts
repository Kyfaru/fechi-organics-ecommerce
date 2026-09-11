/**
 * POST /api/admin/orders/instore/[id]/send-receipt
 *
 * Sends the invoice receipt email for an in-store order to the walk-in
 * customer. Admin-only. Email-only — SMS invoices were removed.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { getOrCreateInStoreInvoice } from "@/lib/invoice/get-or-create-instore-invoice";
import { sendInvoiceEmail } from "@/lib/email";
import { emailShell, emailSection, emailButton, emailIconCircle, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";

const bodySchema = z.object({ channel: z.literal("email") }).strict();

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
  const sections = [
    emailSection(`
      ${emailIconCircle("receipt")}
      <h1 style="margin:0 0 16px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">Your Invoice Is Ready</h1>
      <p style="margin:0 0 28px;text-align:center;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">
        Invoice <strong>${args.invoiceNumber}</strong> for your Fechi Organics in-store purchase — total paid <strong>${kes(args.totalKes)}</strong>. It's attached as a PDF.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td>${emailButton("View Invoice", args.url)}</td></tr></table>
    `),
  ].join("");

  return emailShell({ title: "Your Invoice Is Ready", sectionsHtml: sections });
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

  try {
    bodySchema.parse(await req.json());
  } catch {
    return Err.validation("Invalid request body");
  }

  try {
    const order = await db.inStoreOrder.findUnique({ where: { id } });
    if (!order) return Err.notFound("Order");

    // Should already be cached from the payment-success path, but call it
    // anyway rather than assuming that pre-warm succeeded.
    const invoice = await getOrCreateInStoreInvoice(id);
    if (!invoice) return Err.notFound("Order");

    if (!order.customerEmail) {
      return err("NO_EMAIL", "No email address on file for this order", 400);
    }
    const html = buildInvoiceEmailHtml({ invoiceNumber: invoice.invoiceNumber, totalKes: order.totalKes, url: invoice.url });
    await sendInvoiceEmail({ email: order.customerEmail, orderId: order.id, invoiceNumber: invoice.invoiceNumber, html, pdfBuffer: invoice.buffer });
    await db.inStoreOrder.update({ where: { id }, data: { receiptSentEmail: true } });
    return ok({ sent: ["email"] });
  } catch (e) {
    console.error("[instore/send-receipt] POST error", e);
    return Err.internal(e);
  }
}
