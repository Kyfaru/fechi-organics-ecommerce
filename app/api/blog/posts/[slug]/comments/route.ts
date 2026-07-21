import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { makeRatelimit } from "@/lib/ratelimit";

const ratelimit = makeRatelimit(Ratelimit.slidingWindow(5, "1 m"), "blog_comment");

const CommentSchema = z.object({ content: z.string().trim().min(1).max(2000) }).strict();

/** GET /api/blog/posts/[slug]/comments — visible comments, newest first */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  try {
    const { slug } = await params;
    const post = await db.blogPost.findUnique({ where: { slug }, select: { id: true } });
    if (!post) return Err.notFound("Post");

    const comments = await db.blogComment.findMany({
      where: { postId: post.id, status: "VISIBLE" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        parentId: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true, image: true } },
      },
    });

    return ok({ comments });
  } catch (e) {
    console.error("[blog comments] GET error", e);
    return Err.internal();
  }
}

/** POST /api/blog/posts/[slug]/comments — create a comment */
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
    const parsed = CommentSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { slug } = await params;
    const post = await db.blogPost.findUnique({ where: { slug }, select: { id: true } });
    if (!post) return Err.notFound("Post");

    const [comment] = await db.$transaction([
      db.blogComment.create({
        data: { postId: post.id, userId, content: parsed.data.content },
        select: {
          id: true,
          content: true,
          parentId: true,
          createdAt: true,
          userId: true,
          user: { select: { name: true, image: true } },
        },
      }),
      db.blogPost.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } }),
    ]);

    return created({ comment });
  } catch (e) {
    console.error("[blog comments] POST error", e);
    return Err.internal();
  }
}
