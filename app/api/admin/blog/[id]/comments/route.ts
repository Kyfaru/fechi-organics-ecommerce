import { headers } from "next/headers";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

/** GET /api/admin/blog/[id]/comments — all comments for a post, any status */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

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
    return Err.internal();
  }
}
