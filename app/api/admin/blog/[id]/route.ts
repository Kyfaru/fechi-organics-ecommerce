import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** GET /api/admin/blog/[id] — single post */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  const denied = await requirePermission(req, { content: ["view"] });
  if (denied) return denied;

  const { id } = await params;

  try {
    const post = await db.blogPost.findUnique({
      where: { id },
      include: { author: { select: { name: true, email: true } } },
    });
    if (!post) return Err.notFound("Blog post");
    return ok(post);
  } catch (e) {
    console.error("[blog/GET/id]", e);
    return Err.internal(e);
  }
}

/** PATCH /api/admin/blog/[id] — update post (title, content, status, etc.) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { content: ["update"] });
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  try {
    // If status is being set to PUBLISHED and no publishedAt yet, set it now
    const statusUpdate = body.status as string | undefined;
    const publishedAt =
      statusUpdate === "PUBLISHED" && !body.publishedAt
        ? new Date()
        : body.publishedAt
        ? new Date(body.publishedAt as string)
        : undefined;

    // authorIds drives authorId when present: a non-empty selection makes its
    // first entry the primary author (kept in sync for the single-author
    // `author` relation still read elsewhere); an explicitly emptied
    // selection falls back to whoever is making the edit. When the field is
    // absent from the payload entirely, neither column is touched — existing
    // callers that only PATCH other fields must not have authorId reset out
    // from under them.
    const authorIdsUpdate = Array.isArray(body.authorIds) ? (body.authorIds as string[]) : undefined;

    const post = await db.blogPost.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: String(body.title) }),
        ...(body.slug !== undefined && { slug: String(body.slug) }),
        ...(body.excerpt !== undefined && { excerpt: body.excerpt ? String(body.excerpt) : null }),
        ...(body.content !== undefined && { content: body.content ? String(body.content) : null }),
        ...(body.featuredImage !== undefined && { featuredImage: body.featuredImage ? String(body.featuredImage) : null }),
        ...(body.category !== undefined && { category: body.category ? String(body.category) : null }),
        ...(body.tags !== undefined && { tags: body.tags as string[] }),
        ...(authorIdsUpdate !== undefined && { authorIds: authorIdsUpdate }),
        ...(authorIdsUpdate !== undefined && {
          authorId: authorIdsUpdate.length > 0 ? authorIdsUpdate[0] : session.user.id,
        }),
        ...(statusUpdate !== undefined && { status: statusUpdate as "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED" }),
        ...(publishedAt !== undefined && { publishedAt }),
        ...(body.seoTitle !== undefined && { seoTitle: body.seoTitle ? String(body.seoTitle) : null }),
        ...(body.metaDesc !== undefined && { metaDesc: body.metaDesc ? String(body.metaDesc) : null }),
      },
      include: { author: { select: { name: true } } },
    });
    return ok(post);
  } catch (e) {
    console.error("[blog/PATCH]", e);
    return Err.internal(e);
  }
}

/** DELETE /api/admin/blog/[id] — archive post */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { content: ["delete"] });
  if (denied) return denied;

  const { id } = await params;

  try {
    const post = await db.blogPost.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    console.info(`[blog/DELETE] Archived post: ${id}`);
    return ok({ id: post.id, status: "ARCHIVED" });
  } catch (e) {
    console.error("[blog/DELETE]", e);
    return Err.internal(e);
  }
}
