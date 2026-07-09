import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { publishQstashJSON } from "@/lib/qstash";
import { runCampaignSend, markCampaignFailed } from "@/lib/campaigns/send-campaign";
import { requireAdminPage } from "@/lib/admin-guard";
import { assertTrustedOrigin } from "@/lib/origin-check";
import type { CampaignStatus } from "@prisma/client";

// "Send Later" batch window — not a precise time, just "goes out shortly in the background"
const SEND_LATER_DELAY_SECONDS = 5 * 60;

type SendMode = "now" | "schedule" | "later";

/** POST /api/admin/campaigns/[id]/send
 *  Enqueues campaign to Qstash worker.
 *  mode "now"      — publish immediately, status -> SENDING.
 *  mode "schedule" — publish at an exact future datetime (Qstash notBefore), status -> SCHEDULED.
 *  mode "later"    — publish after a short fixed delay, status -> SENDING.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requireAdminPage(req, 'campaigns');
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) return Err.notFound("Campaign");
  if (campaign.status === "SENDING" || campaign.status === "SENT") {
    return Err.validation(`Campaign is already ${campaign.status.toLowerCase()}`);
  }

  const body = await req.json().catch(() => ({}));
  const mode: SendMode = body?.mode === "schedule" || body?.mode === "later" ? body.mode : "now";

  let notBefore: number | undefined;
  let data: { status: CampaignStatus; scheduledAt?: Date; sentAt?: Date };

  if (mode === "schedule") {
    const targetDate = new Date(body?.scheduledAt);
    if (!body?.scheduledAt || Number.isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
      return Err.validation("scheduledAt must be a valid future date");
    }
    notBefore = Math.floor(targetDate.getTime() / 1000);
    data = { status: "SCHEDULED", scheduledAt: targetDate };
  } else if (mode === "later") {
    const targetDate = new Date(Date.now() + SEND_LATER_DELAY_SECONDS * 1000);
    notBefore = Math.floor(targetDate.getTime() / 1000);
    data = { status: "SENDING", scheduledAt: targetDate };
  } else {
    data = { status: "SENDING", sentAt: new Date() };
  }

  try {
    // Enqueue to Qstash worker for async processing
    const published = await publishQstashJSON(
      "/api/admin/workers/send-campaign",
      { campaignId: id },
      notBefore ? { notBefore } : undefined
    );

    const updated = await db.campaign.update({ where: { id }, data });

    if (published) {
      console.info(`[campaigns/send] Campaign ${id} (${campaign.name}) enqueued to Qstash (mode=${mode})`);
    } else if (mode === "now") {
      // Qstash couldn't be reached (no token, or destination not publicly
      // reachable — e.g. local dev without a tunnel, since Qstash is a
      // hosted service and can never call back to localhost). Send directly
      // in-process instead of leaving the campaign stuck at SENDING forever.
      // Not awaited so the request still returns immediately, same as the
      // Qstash path — a batch of thousands would otherwise risk a timeout.
      console.warn(`[campaigns/send] Qstash unavailable — sending campaign ${id} directly in-process.`);
      runCampaignSend(id, updated).catch((err) => markCampaignFailed(id, err));
    } else {
      // "schedule"/"later" genuinely need a queue to fire at a future time —
      // there's no in-process fallback for those without Qstash configured.
      console.error(`[campaigns/send] Qstash unavailable — campaign ${id} (mode=${mode}) will not send until Qstash is reachable.`);
    }

    return ok({ queued: true, campaign: updated });
  } catch (e) {
    console.error("[campaigns/send/POST]", e);
    return Err.internal("Failed to enqueue campaign");
  }
}
