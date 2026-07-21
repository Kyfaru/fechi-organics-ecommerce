import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { makeRatelimit } from "@/lib/ratelimit";

const ratelimit = makeRatelimit(Ratelimit.slidingWindow(20, "1 m"), "blog_reaction");

const ReactionSchema = z.object({ type: z.enum(["LIKE", "DISLIKE"]) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();
    const userId = session.user.id;

    if (ratelimit) {
      const { success } = await ratelimit.limit(userId);
      if (!success) return Err.rateLimited();
    }

    const body = await req.json().catch(() => ({}));
    const parsed = ReactionSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
    const { type } = parsed.data;

    const { slug } = await params;
    const post = await db.blogPost.findUnique({ where: { slug }, select: { id: true } });
    if (!post) return Err.notFound("Post");
    const postId = post.id;

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.blogReaction.findUnique({
        where: { postId_userId: { postId, userId } },
      });

      if (!existing) {
        await tx.blogReaction.create({ data: { postId, userId, type } });
        await tx.blogPost.update({
          where: { id: postId },
          data: type === "LIKE" ? { likeCount: { increment: 1 } } : { dislikeCount: { increment: 1 } },
        });
      } else if (existing.type === type) {
        await tx.blogReaction.delete({ where: { postId_userId: { postId, userId } } });
        await tx.blogPost.update({
          where: { id: postId },
          data: type === "LIKE" ? { likeCount: { decrement: 1 } } : { dislikeCount: { decrement: 1 } },
        });
      } else {
        await tx.blogReaction.update({
          where: { postId_userId: { postId, userId } },
          data: { type },
        });
        await tx.blogPost.update({
          where: { id: postId },
          data:
            type === "LIKE"
              ? { likeCount: { increment: 1 }, dislikeCount: { decrement: 1 } }
              : { dislikeCount: { increment: 1 }, likeCount: { decrement: 1 } },
        });
      }

      const updated = await tx.blogPost.findUniqueOrThrow({
        where: { id: postId },
        select: { likeCount: true, dislikeCount: true },
      });
      const userReaction = !existing ? type : existing.type === type ? null : type;

      return { ...updated, userReaction };
    });

    return ok(result);
  } catch (e) {
    console.error("[blog reactions] POST error", e);
    return Err.internal();
  }
}
