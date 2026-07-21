import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** DELETE /api/blog/comments/[commentId] — author or admin only */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const { commentId } = await params;
    const comment = await db.blogComment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, userId: true },
    });
    if (!comment) return Err.notFound("Comment");

    const isOwner = comment.userId === session.user.id;
    if (!isOwner) {
      const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
      if (user?.role !== "admin") return Err.forbidden();
    }

    await db.$transaction([
      db.blogComment.delete({ where: { id: commentId } }),
      db.blogPost.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } }),
    ]);

    return ok({ id: commentId });
  } catch (e) {
    console.error("[blog comments] DELETE error", e);
    return Err.internal();
  }
}
