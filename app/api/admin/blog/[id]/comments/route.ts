import { connection } from "next/server";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";

/** GET /api/admin/blog/[id]/comments — all comments for a post, any status */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();

  const denied = await requirePermission(req, { content: ["view"] });
  if (denied) return denied;

  const { id } = await params;

  try {
    const comments = await db.blogComment.findMany({
      where: { postId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });
    return ok({ comments });
  } catch (e) {
    console.error("[admin blog/id/comments] GET error", e);
    return Err.internal(e);
  }
}
