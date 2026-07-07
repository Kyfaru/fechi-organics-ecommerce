import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { qstashReceiver } from "@/lib/qstash";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/twilio";

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

  const { campaignId } = JSON.parse(rawBody) as { campaignId: string };

  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Determine audience: custom list or all verified non-banned users
  const isCustomAudience =
    campaign.audienceCustomerIds && campaign.audienceCustomerIds.length > 0;

  const users = await db.user.findMany({
    where: {
      ...(isCustomAudience
        ? { id: { in: campaign.audienceCustomerIds } }
        : { emailVerified: true, banned: false }),
    },
    select: { id: true, email: true, name: true, phone: true },
  });

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "SENDING" },
  });

  let sentCount = 0;
  const batchSize = 50;

  // Strip HTML tags for SMS/WhatsApp plain-text body
  const plainContent = (campaign.content ?? "").replace(/<[^>]+>/g, "");

  const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${campaign.subject ?? campaign.name}</title></head>
<body style="margin:0;padding:0;background:#f4f6f3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:#27731e;padding:32px 48px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Fechi Organics</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">${campaign.subject ?? campaign.name}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            <div style="font-size:15px;color:#40493c;line-height:1.7;">${(campaign.content ?? "").replace(/\n/g, "<br>")}</div>
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

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    for (const user of batch) {
      try {
        // Send email when type is EMAIL or ALL
        if (campaign.type === "EMAIL" || campaign.type === "ALL") {
          const { error } = await resend.emails.send({
            from: process.env.EMAIL_FROM!,
            to: user.email,
            subject: campaign.subject ?? campaign.name,
            html: emailHtml,
          });
          if (!error) sentCount++;
        }

        // Send SMS when type is SMS or ALL — skip users without a phone number
        if ((campaign.type === "SMS" || campaign.type === "ALL") && user.phone) {
          await sendSms(user.phone, plainContent);
          // Only increment if we haven't already counted this user from the email send
          if (campaign.type === "SMS") sentCount++;
        }

        // Write an in-app inbox message when type is PUSH or ALL, so the
        // campaign actually shows up in the customer's /account/inbox —
        // title/body mirror the same heading/content used for email+SMS above
        if (campaign.type === "PUSH" || campaign.type === "ALL") {
          await db.inboxMessage.create({
            data: {
              userId: user.id,
              type: "PROMOTION",
              title: campaign.heading ?? campaign.subject ?? campaign.name,
              body: plainContent,
            },
          });
          // Only increment if we haven't already counted this user from the email send
          if (campaign.type === "PUSH") sentCount++;
        }
      } catch (err) {
        // Log but continue — one failed delivery must not abort the batch
        console.error(`[send-campaign] Failed delivery for ${user.email}:`, err);
      }
    }

    await db.campaign.update({
      where: { id: campaignId },
      data: { sentCount },
    });

    if (i + batchSize < users.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "SENT", sentAt: new Date(), sentCount },
  });

  return NextResponse.json({ ok: true, sentCount });
}
