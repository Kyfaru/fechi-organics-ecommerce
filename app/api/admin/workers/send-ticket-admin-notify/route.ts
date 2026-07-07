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

  const { ticketId, messageId, customerName, subject, content } = JSON.parse(rawBody) as {
    ticketId: string;
    messageId: string;
    customerName: string;
    subject: string;
    content: string;
  };

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@fechiorganics.com";
  const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/customers/tickets?ticket=${ticketId}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>New customer reply</title></head>
<body style="margin:0;padding:0;background:#f4f6f3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:#27731e;padding:32px 48px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Fechi Organics Admin</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">New Customer Reply</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            <p style="font-size:15px;color:#40493c;line-height:1.6;">
              <strong>${customerName}</strong> replied to ticket: <strong>${subject}</strong>
            </p>
            <blockquote style="border-left:3px solid #43a935;margin:16px 0;padding:12px 20px;background:#ecf8e6;border-radius:0 8px 8px 0;">
              <p style="margin:0;font-size:14px;color:#3d4235;line-height:1.6;">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
            </blockquote>
            <a href="${ticketUrl}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#27731e;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
              View Ticket
            </a>
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
