import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** GET /api/admin/blog */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { content: ["view"] });
  if (denied) return denied;

  try {
    const posts = await db.blogPost.findMany({
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    return ok(posts);
  } catch (e) {
    console.error("[blog/GET]", e);
    return Err.internal(e);
  }
}

/** POST /api/admin/blog — create blog post draft */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { content: ["create"] });
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  let body: {
    title: string;
    slug?: string;
    excerpt?: string;
    content?: string;
    featuredImage?: string;
    category?: string;
    tags?: string[];
    authorIds?: string[];
    status?: "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";
    seoTitle?: string;
    metaDesc?: string;
    publishedAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.title?.trim()) return Err.validation("Title is required");

  // Auto-generate slug from title if not provided
  const slug =
    body.slug?.trim() ||
    body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  // authorId stays populated for existing single-author reads (list views,
  // the `author` relation) even now that authorIds carries the full set —
  // first entry wins; an empty/missing selection falls back to the creator.
  const authorIds = Array.isArray(body.authorIds) ? body.authorIds : [];
  const authorId = authorIds.length > 0 ? authorIds[0] : session.user.id;

  try {
    const post = await db.blogPost.create({
      data: {
        title: body.title.trim(),
        slug,
        excerpt: body.excerpt ?? null,
        content: body.content ?? null,
        featuredImage: body.featuredImage ?? null,
        category: body.category ?? null,
        tags: body.tags ?? [],
        status: body.status ?? "DRAFT",
        authorId,
        authorIds,
        seoTitle: body.seoTitle ?? null,
        metaDesc: body.metaDesc ?? null,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
      },
      include: { author: { select: { name: true } } },
    });
    console.info(`[blog/POST] Created post: ${post.id} — "${post.title}"`);
    return created(post);
  } catch (e: unknown) {
    // Handle unique slug constraint
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return Err.validation("A post with this slug already exists. Please choose a different title or slug.");
    }
    console.error("[blog/POST]", e);
    return Err.internal(e);
  }
}
