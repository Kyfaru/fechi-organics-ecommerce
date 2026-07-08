import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { qstashReceiver } from "@/lib/qstash";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/twilio";
import { wrapLinksForTracking } from "@/lib/campaign-tracking";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const TWILIO_STATUS_CALLBACK = `${APP_URL}/api/webhooks/twilio/status`;

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

  try {
    return await sendCampaign(campaignId, campaign);
  } catch (err) {
    console.error(`[send-campaign] Campaign ${campaignId} failed:`, err);
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        status: "FAILED",
        lastError: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json({ error: "Campaign send failed" }, { status: 500 });
  }
}

async function sendCampaign(
  campaignId: string,
  campaign: NonNullable<Awaited<ReturnType<typeof db.campaign.findUnique>>>
) {
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

  // Recipient rows already marked SENT/DELIVERED on a prior (failed/retried) run
  // are skipped below, so a QStash retry after a partial failure never re-sends.
  const alreadySent = await db.campaignRecipient.findMany({
    where: { campaignId, status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] } },
    select: { userId: true, channel: true },
  });
  const sentKey = (userId: string, channel: string) => `${userId}:${channel}`;
  const alreadySentSet = new Set(alreadySent.map((r) => sentKey(r.userId, r.channel)));

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "SENDING" },
  });

  const batchSize = 50;

  // Strip HTML tags for SMS/WhatsApp plain-text body
  const plainContent = (campaign.content ?? "").replace(/<[^>]+>/g, "");

  function buildEmailHtml(userId: string): string {
    const content = wrapLinksForTracking(
      (campaign.content ?? "").replace(/\n/g, "<br>"),
      campaignId,
      userId
    );
    return `<!DOCTYPE html>
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
            <div style="font-size:15px;color:#40493c;line-height:1.7;">${content}</div>
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
  }

  const channelsForType: Record<string, ("EMAIL" | "SMS" | "PUSH")[]> = {
    EMAIL: ["EMAIL"],
    SMS: ["SMS"],
    PUSH: ["PUSH"],
    ALL: ["EMAIL", "SMS", "PUSH"],
  };
  const channels = channelsForType[campaign.type] ?? [];
  const countedUserIds = new Set(alreadySent.map((r) => r.userId));
  let sentCount = countedUserIds.size;

  async function recordResult(
    userId: string,
    channel: "EMAIL" | "SMS" | "PUSH",
    result: { ok: true; providerMessageId?: string } | { ok: false; error: string }
  ) {
    await db.campaignRecipient.upsert({
      where: { campaignId_userId_channel: { campaignId, userId, channel } },
      create: {
        campaignId,
        userId,
        channel,
        status: result.ok ? "SENT" : "FAILED",
        providerMessageId: result.ok ? result.providerMessageId : undefined,
        errorMessage: result.ok ? undefined : result.error,
        sentAt: result.ok ? new Date() : undefined,
        failedAt: result.ok ? undefined : new Date(),
      },
      update: {
        status: result.ok ? "SENT" : "FAILED",
        providerMessageId: result.ok ? result.providerMessageId : undefined,
        errorMessage: result.ok ? undefined : result.error,
        sentAt: result.ok ? new Date() : undefined,
        failedAt: result.ok ? undefined : new Date(),
      },
    });
    if (result.ok && !countedUserIds.has(userId)) {
      countedUserIds.add(userId);
      sentCount++;
    }
  }

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    for (const user of batch) {
      for (const channel of channels) {
        if (channel === "SMS" && !user.phone) continue;
        if (alreadySentSet.has(sentKey(user.id, channel))) continue;

        try {
          if (channel === "EMAIL") {
            const { data, error } = await resend.emails.send({
              from: process.env.EMAIL_FROM!,
              to: user.email,
              subject: campaign.subject ?? campaign.name,
              html: buildEmailHtml(user.id),
            });
            if (error) throw new Error(error.message);
            await recordResult(user.id, "EMAIL", { ok: true, providerMessageId: data?.id });
          } else if (channel === "SMS") {
            const sid = await sendSms(user.phone!, plainContent, TWILIO_STATUS_CALLBACK);
            await recordResult(user.id, "SMS", { ok: true, providerMessageId: sid });
          } else if (channel === "PUSH") {
            // Write an in-app inbox message, so the campaign actually shows up
            // in the customer's /account/inbox (no real push provider exists).
            await db.inboxMessage.create({
              data: {
                userId: user.id,
                type: "PROMOTION",
                title: campaign.heading ?? campaign.subject ?? campaign.name,
                body: plainContent,
              },
            });
            await recordResult(user.id, "PUSH", { ok: true });
          }
        } catch (err) {
          // Log but continue — one failed delivery must not abort the batch
          console.error(`[send-campaign] Failed ${channel} delivery for ${user.email}:`, err);
          await recordResult(user.id, channel, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
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
