import { db } from "@/lib/db";

export type BlogPostCard = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImage: string | null;
  category: string | null;
  tags: string[];
  publishedAt: Date | null;
  author: { name: string | null };
};

export type BlogPostDetail = BlogPostCard & {
  content: string | null;
  seoTitle: string | null;
  metaDesc: string | null;
};

/** Returns all published blog posts ordered by publish date descending. */
export async function getPublishedPosts(): Promise<BlogPostCard[]> {
  return db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      featuredImage: true,
      category: true,
      tags: true,
      publishedAt: true,
      author: { select: { name: true } },
    },
  });
}

/**
 * Returns a single published blog post by slug.
 * Returns null if the post does not exist or is not published.
 */
export async function getPostBySlug(slug: string): Promise<BlogPostDetail | null> {
  const post = await db.blogPost.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      featuredImage: true,
      category: true,
      tags: true,
      publishedAt: true,
      content: true,
      seoTitle: true,
      metaDesc: true,
      status: true,
      author: { select: { name: true } },
    },
  });

  if (!post || post.status !== "PUBLISHED") return null;

  // Strip the status field before returning — it is not part of BlogPostDetail
  const { status: _status, ...rest } = post;
  return rest;
}
