import { createHash } from "crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

const DEDUP_TTL_SECONDS = 1800; // 30 min — matches the doc's re-view window

function viewerHash(ip: string, userAgent: string): string {
  return createHash("sha256")
    .update(ip + userAgent + (process.env.REDIS_CHANNEL_SECRET ?? "dev-secret"))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Records one view for a blog post, de-duplicated per visitor for 30 minutes
 * so refreshing the tab doesn't inflate the count. Never throws — a failed
 * view record should never break the page render.
 */
export async function recordBlogView(postId: string): Promise<void> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const userAgent = h.get("user-agent") ?? "unknown";
    const hash = viewerHash(ip, userAgent);

    const redis = getRedis();
    const key = `blog:view:${postId}:${hash}`;
    if (await redis.get(key)) return;

    await db.$transaction([
      db.blogView.create({ data: { postId, viewerHash: hash } }),
      db.blogPost.update({ where: { id: postId }, data: { views: { increment: 1 } } }),
    ]);
    await redis.set(key, "1", { ex: DEDUP_TTL_SECONDS });
  } catch (e) {
    console.error("[blog-views] recordBlogView error", e);
  }
}
