import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { qstashReceiver } from "@/lib/qstash";
import { db } from "@/lib/db";

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

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f6f3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:#27731e;padding:32px 48px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Fechi Organics</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Support Reply</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            ${quotedBlock}
            <p style="font-size:15px;color:#40493c;line-height:1.6;white-space:pre-wrap;">${escapeHtml(content)}</p>
            <hr style="border:none;border-top:1px solid #e8ede6;margin:32px 0;"/>
            <p style="font-size:13px;color:rgba(64,73,60,0.6);line-height:1.6;">
              Please reply from your message inbox at
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/messages" style="color:#27731e;">fechiorganics.com/messages</a>
              — replies sent directly to this email are not monitored.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f4f6f3;padding:20px 48px;text-align:center;border-top:1px solid #e8ede6;">
            <p style="margin:0;font-size:12px;color:rgba(64,73,60,0.5);">© ${new Date().getFullYear()} Fechi Organics. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
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
