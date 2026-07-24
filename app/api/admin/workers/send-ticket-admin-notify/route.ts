import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { qstashReceiver } from "@/lib/qstash";
import { db } from "@/lib/db";
import { emailShell, emailSection, emailButton, emailIconCircle, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const signature = req.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const isValid = await qstashReceiver.verify({ signature, body: rawBody });
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { ticketId, messageId, customerName, subject, content } = JSON.parse(rawBody) as {
    ticketId: string;
    messageId: string;
    customerName: string;
    subject: string;
    content: string;
  };

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@fechiorganics.com";
  const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/customers/tickets?ticket=${ticketId}`;

  const sections = [
    emailSection(`
      ${emailIconCircle("chart")}
      <h1 style="margin:0 0 20px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">New Customer Reply</h1>
      <p style="font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">
        <strong>${customerName}</strong> replied to ticket: <strong>${subject}</strong>
      </p>
      <blockquote style="border-left:3px solid ${EMAIL_BRAND.success};margin:16px 0;padding:12px 20px;background:${EMAIL_BRAND.successBg};border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:14px;color:${EMAIL_BRAND.textBody};line-height:1.6;">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      </blockquote>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td>${emailButton("View Ticket", ticketUrl)}</td></tr></table>
    `),
  ].join("");

  const html = emailShell({ title: "New customer reply", sectionsHtml: sections });

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: adminEmail,
    subject: `[Customer Reply] ${subject}`,
    html,
  });

  if (error) {
    console.error("[send-ticket-admin-notify] Resend error:", error);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }

  await db.ticketMessage.update({
    where: { id: messageId },
    data: { emailSentAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
