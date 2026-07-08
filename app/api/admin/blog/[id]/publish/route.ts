import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { publishQstashJSON } from "@/lib/qstash";
import { assertTrustedOrigin } from "@/lib/origin-check";

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

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  const post = await db.blogPost.findUnique({ where: { id } });
  if (!post) return Err.notFound("Blog post");

  const body = await req.json().catch(() => ({}));

  const targetDate = new Date(body?.scheduledAt);
  if (!body?.scheduledAt || Number.isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
    return Err.validation("scheduledAt must be a valid future date");
  }
  const notBefore = Math.floor(targetDate.getTime() / 1000);

  try {
    // Enqueue to Qstash worker for async processing at the exact scheduled time
    await publishQstashJSON(
      "/api/admin/workers/publish-blog-post",
      { postId: id },
      { notBefore }
    );

    const updated = await db.blogPost.update({
      where: { id },
      data: { status: "SCHEDULED", publishedAt: targetDate },
    });

    console.info(`[blog/publish] Post ${id} ("${post.title}") scheduled for ${targetDate.toISOString()}`);
    return ok({ queued: true, post: updated });
  } catch (e) {
    console.error("[blog/[id]/publish/POST]", e);
    return Err.internal("Failed to schedule post");
  }
}
