import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { logActivity } from "@/lib/admin-activity";

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

  const denied = await requirePermission(req, { campaigns: ["send"] });
  if (denied) return denied;

  const { id } = await params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) return Err.notFound("Campaign");
  if (campaign.status === "SENDING" || campaign.status === "SENT") {
    return Err.validation(`Campaign is already ${campaign.status.toLowerCase()}`);
  }

  const body = await req.json().catch(() => ({}));
  const mode: SendMode = body?.mode === "schedule" || body?.mode === "later" ? body.mode : "now";

  if (mode === "schedule") {
    const targetDate = new Date(body?.scheduledAt);
    if (!body?.scheduledAt || Number.isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
      return Err.validation("scheduledAt must be a valid future date");
    }
  }

  try {
    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const payload = { mode, scheduledAt: body?.scheduledAt };
    const outcome = await requireApprovalOrProceed(ctx, "campaigns", "send", payload, id);
    if (!outcome.proceed) return Approval.queued(outcome.requestId);

    const updated = await approvalExecutors["campaigns:send"](payload, id) as
      Awaited<ReturnType<typeof db.campaign.update>>;

    console.info(`[campaigns/send] Campaign ${id} (${campaign.name}) enqueued (mode=${mode})`);
    logActivity(ctx.id, `Sent campaign "${campaign.name}" (mode=${mode})`, "campaign", id, req);
    return ok({ queued: true, campaign: updated });
  } catch (e) {
    console.error("[campaigns/send/POST]", e);
    return Err.internal("Failed to enqueue campaign");
  }
}
