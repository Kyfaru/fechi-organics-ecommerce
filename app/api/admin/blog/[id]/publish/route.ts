import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { logActivity } from "@/lib/admin-activity";
import { reportError, trackServerEvent } from "@/lib/observability";

/** POST /api/admin/blog/[id]/publish
 *  Enqueues a blog post to auto-publish at an exact future datetime via Qstash.
 *  Body: { mode: "schedule", scheduledAt: ISO datetime string }
 *  Mirrors app/api/admin/campaigns/[id]/send/route.ts's "schedule" mode —
 *  a blog post only ever gets scheduled from this route (an immediate
 *  publish is just a normal PATCH with status: "PUBLISHED").
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { content: ["publish"] });
  if (denied) return denied;

  const { id } = await params;

  const post = await db.blogPost.findUnique({ where: { id } });
  if (!post) return Err.notFound("Blog post");

  const body = await req.json().catch(() => ({}));

  const targetDate = new Date(body?.scheduledAt);
  if (!body?.scheduledAt || Number.isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
    return Err.validation("scheduledAt must be a valid future date");
  }

  try {
    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const outcome = await requireApprovalOrProceed(
      ctx, "content", "publish", { scheduledAt: targetDate.toISOString() }, id
    );
    if (!outcome.proceed) return Approval.queued(outcome.requestId);

    const updated = await approvalExecutors["content:publish"](
      { scheduledAt: targetDate.toISOString() }, id
    ) as Awaited<ReturnType<typeof db.blogPost.update>>;

    console.info(`[blog/publish] Post ${id} ("${post.title}") scheduled for ${targetDate.toISOString()}`);
    logActivity(ctx.id, "Scheduled blog post", "blog", id, req, { scheduledAt: targetDate.toISOString() });
    trackServerEvent(ctx.id, "blog_post_scheduled", { postId: id, scheduledAt: targetDate.toISOString() });
    return ok({ queued: true, post: updated });
  } catch (e) {
    console.error("[blog/[id]/publish/POST]", e);
    reportError(e, { route: "POST /api/admin/blog/[id]/publish", extra: { postId: id } });
    return Err.internal();
  }
}
