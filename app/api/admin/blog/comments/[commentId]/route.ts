import { headers } from "next/headers";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";

const StatusSchema = z.object({ status: z.enum(["VISIBLE", "HIDDEN", "FLAGGED"]) }).strict();

/** PATCH /api/admin/blog/comments/[commentId] — moderate a comment (hide/flag/restore) */
export async function PATCH(req: Request, { params }: { params: Promise<{ commentId: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { commentId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = StatusSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const comment = await db.blogComment.update({
      where: { id: commentId },
      data: { status: parsed.data.status },
      select: { id: true, status: true },
    });
    return ok(comment);
  } catch (e) {
    console.error("[admin blog comments] PATCH error", e);
    return Err.internal();
  }
}
