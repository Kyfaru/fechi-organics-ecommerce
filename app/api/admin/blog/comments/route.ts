import { connection } from "next/server";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

/**
 * GET /api/admin/blog/comments — all comments across every post, newest
 * first, joined with the post title/slug so the standalone Comments page
 * doesn't need per-post navigation. Optional ?status= and ?postId= filters.
 */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { content: ["view"] });
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const postId = searchParams.get("postId");

  try {
    const comments = await db.blogComment.findMany({
      where: {
        ...(status && ["VISIBLE", "HIDDEN", "FLAGGED"].includes(status)
          ? { status: status as "VISIBLE" | "HIDDEN" | "FLAGGED" }
          : {}),
        ...(postId ? { postId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        postId: true,
        post: { select: { title: true, slug: true } },
        user: { select: { name: true, email: true } },
      },
      take: 200,
    });
    return ok({ comments });
  } catch (e) {
    console.error("[admin blog/comments] GET error", e);
    reportError(e, { route: "GET /api/admin/blog/comments" });
    return Err.internal();
  }
}
