import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { qstashReceiver } from "@/lib/qstash";
import { db } from "@/lib/db";
import { emailShell, emailSection, emailIconCircle, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

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

  const { messageId, recipientEmail, subject, content, quotedContent } = JSON.parse(rawBody) as {
    ticketId: string;
    messageId: string;
    recipientEmail: string;
    subject: string;
    content: string;
    quotedContent?: string;
  };

  const escapeHtml = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Quoted block renders ABOVE the new reply when the customer's last
  // message is available — gives the recipient context at a glance.
  const quotedBlock = quotedContent
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6f3;border-left:3px solid #c0cab8;border-radius:0 8px 8px 0;margin-bottom:24px;">
         <tr>
           <td style="padding:14px 20px;">
             <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:rgba(64,73,60,0.5);">Your message</p>
             <p style="margin:0;font-size:14px;color:rgba(64,73,60,0.75);line-height:1.6;white-space:pre-wrap;">${escapeHtml(quotedContent)}</p>
           </td>
         </tr>
       </table>`
    : "";

  const sections = [
    emailSection(`
      ${emailIconCircle("check")}
      <h1 style="margin:0 0 24px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">Support Reply</h1>
      ${quotedBlock}
      <p style="font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;white-space:pre-wrap;">${escapeHtml(content)}</p>
      <hr style="border:none;border-top:1px solid ${EMAIL_BRAND.divider};margin:32px 0;"/>
      <p style="font-size:13px;color:${EMAIL_BRAND.textMuted};line-height:1.6;">
        Please reply from your message inbox at
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/account/messages" style="color:${EMAIL_BRAND.primaryGreen};">fechiorganics.com/account/messages</a>
        — replies sent directly to this email are not monitored.
      </p>
    `),
  ].join("");

  const html = emailShell({ title: subject, sectionsHtml: sections });

  const { error } = await getResend().emails.send({
    from: process.env.EMAIL_FROM!,
    to: recipientEmail,
    subject,
    html,
  });

  if (error) {
    console.error("[send-ticket-email] Resend error:", error);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }

  await db.ticketMessage.update({
    where: { id: messageId },
    data: { emailSentAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
