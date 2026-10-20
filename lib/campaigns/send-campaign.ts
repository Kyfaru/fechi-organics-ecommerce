import { Resend } from "resend";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { wrapLinksForTracking } from "@/lib/campaign-tracking";
import { emailShell, emailSection, emailIconCircle, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";
import type { campaign as Campaign } from "@prisma/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const TWILIO_STATUS_CALLBACK = `${APP_URL}/api/webhooks/twilio/status`;

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/**
 * Does the actual sending for a campaign — shared by the QStash worker route
 * (production/normal path) and the direct in-process fallback in the /send
 * route (used when QStash can't be reached, e.g. local dev without a public
 * tunnel — QStash is a hosted service and can never call back to localhost).
 */
export async function runCampaignSend(campaignId: string, campaign: Campaign) {
  // Determine audience: custom list or all verified non-banned users
  const isCustomAudience =
    campaign.audienceCustomerIds && campaign.audienceCustomerIds.length > 0;

  const users = await db.user.findMany({
    where: {
      ...(campaign.audienceExcludeIds?.length ? { id: { notIn: campaign.audienceExcludeIds } } : {}),
      ...(isCustomAudience
        ? { id: { in: campaign.audienceCustomerIds.filter((id) => !campaign.audienceExcludeIds?.includes(id)) } }
        // SMS needs only a phone number (no email consent involved); email/push
        // additionally require a verified email — enforced per channel in the loop.
        : {
            banned: false,
            OR: [{ emailVerified: true }, { phone: { not: null } }],
          }),
    },
    select: { id: true, email: true, name: true, phone: true, phoneCode: true, emailVerified: true },
  });

  // Recipient rows already marked SENT/DELIVERED on a prior (failed/retried) run
  // are skipped below, so a retry after a partial failure never re-sends.
  const alreadySent = await db.campaignRecipient.findMany({
    where: { campaignId, status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] } },
    select: { userId: true, channel: true },
  });
  const sentKey = (userId: string, channel: string) => `${userId}:${channel}`;
  const alreadySentSet = new Set(alreadySent.map((r) => sentKey(r.userId, r.channel)));

  // Edited-as-new campaign: skip anyone the original already reached, per channel.
  if (campaign.excludeSourceRecipients && campaign.sourceCampaignId) {
    const reached = await db.campaignRecipient.findMany({
      where: {
        campaignId: campaign.sourceCampaignId,
        status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] },
      },
      select: { userId: true, channel: true },
    });
    for (const r of reached) alreadySentSet.add(sentKey(r.userId, r.channel));
    console.info(`[send-campaign] ${campaignId} excluding ${reached.length} recipients already reached by ${campaign.sourceCampaignId}`);
  }

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
    const heading = campaign.heading ?? campaign.subject ?? campaign.name;
    const sections = [
      emailSection(`
        ${emailIconCircle("gift")}
        <h1 style="margin:0 0 20px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">${heading}</h1>
        <div style="font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.7;">${content}</div>
      `),
    ].join("");
    return emailShell({ title: campaign.subject ?? campaign.name, sectionsHtml: sections });
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
  let skippedNoPhone = 0;
  const seenPhones = new Set<string>();
  let failedCount = 0;

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
    if (!result.ok) failedCount++;
    if (result.ok && !countedUserIds.has(userId)) {
      countedUserIds.add(userId);
      sentCount++;
    }
  }

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    for (const user of batch) {
      for (const channel of channels) {
        if (alreadySentSet.has(sentKey(user.id, channel))) continue;
        // Email/push consent = verified email; custom lists are explicit admin picks.
        if (channel !== "SMS" && !isCustomAudience && !user.emailVerified) continue;
        if (channel === "SMS" && !user.phone?.trim()) {
          // Never skip silently — leave a row so the delivery drawer shows why.
          skippedNoPhone++;
          await recordResult(user.id, "SMS", { ok: false, error: "No phone number on file" });
          continue;
        }

        try {
          if (channel === "EMAIL") {
            const { data, error } = await getResend().emails.send({
              from: process.env.EMAIL_FROM!,
              to: user.email,
              subject: campaign.subject ?? campaign.name,
              html: buildEmailHtml(user.id),
            });
            if (error) throw new Error(error.message);
            await recordResult(user.id, "EMAIL", { ok: true, providerMessageId: data?.id });
          } else if (channel === "SMS") {
            const phone = combineLegacyPhone(user.phone!, user.phoneCode);
            if (!phone) throw new Error("Invalid phone number");
            // Guest checkouts can create several user rows for one phone; text each number once.
            if (seenPhones.has(phone)) throw new Error("Duplicate number in this campaign");
            seenPhones.add(phone);
            // noFallback: a timeout can mean AT already sent; a Twilio retry would double-send.
            const sid = await sendSms(phone, plainContent, TWILIO_STATUS_CALLBACK, { noFallback: true });
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
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // ponytail: no PARTIAL enum value (needs a schema push) — FAILED when nothing
  // went out, SENT otherwise, with the failed/skipped breakdown in lastError.
  const nothingSent = sentCount === 0 && failedCount > 0;
  const summary =
    failedCount > 0
      ? `${failedCount} failed (${skippedNoPhone} had no phone number); ${sentCount} sent`
      : null;
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      status: nothingSent ? "FAILED" : "SENT",
      sentAt: new Date(),
      sentCount,
      lastError: summary,
    },
  });
  console.info(
    `[send-campaign] ${campaignId} done: sent=${sentCount} failed=${failedCount} skippedNoPhone=${skippedNoPhone} audience=${users.length}`
  );

  return { ok: true, sentCount };
}

/** Marks a campaign FAILED with the given error — shared by both call sites' catch blocks. */
export async function markCampaignFailed(campaignId: string, err: unknown) {
  console.error(`[send-campaign] Campaign ${campaignId} failed:`, err);
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      status: "FAILED",
      lastError: err instanceof Error ? err.message : String(err),
    },
  });
}
