import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { publishQstashJSON } from "@/lib/qstash";
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
    await publishQstashJSON(
      "/api/admin/workers/send-campaign",
      { campaignId: id },
      notBefore ? { notBefore } : undefined
    );

    const updated = await db.campaign.update({ where: { id }, data });

    console.info(`[campaigns/send] Campaign ${id} (${campaign.name}) enqueued to Qstash (mode=${mode})`);
    return ok({ queued: true, campaign: updated });
  } catch (e) {
    console.error("[campaigns/send/POST]", e);
    return Err.internal("Failed to enqueue campaign");
  }
}
