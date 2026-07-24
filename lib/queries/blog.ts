import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

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
  views: number;
  likeCount: number;
  commentCount: number;
  isFeatured: boolean;
};

export type BlogPostDetail = BlogPostCard & {
  content: string | null;
  seoTitle: string | null;
  metaDesc: string | null;
  dislikeCount: number;
  userReaction: "LIKE" | "DISLIKE" | null;
};

export type BlogRankingCard = {
  id: string;
  title: string;
  slug: string;
  featuredImage: string | null;
  publishedAt: Date | null;
  views: number;
  likeCount: number;
};

export type BlogRankings = {
  latest: BlogRankingCard[];
  trending: BlogRankingCard[];
  mostViewed: BlogRankingCard[];
};

const RANKING_SELECT = {
  id: true,
  title: true,
  slug: true,
  featuredImage: true,
  publishedAt: true,
  views: true,
  likeCount: true,
} as const;

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
      views: true,
      likeCount: true,
      commentCount: true,
      isFeatured: true,
    },
  });
}

/**
 * Returns a single published blog post by slug.
 * Returns null if the post does not exist or is not published.
 * Pass `userId` to include that user's current reaction (like/dislike/none).
 */
export async function getPostBySlug(
  slug: string,
  userId?: string,
): Promise<BlogPostDetail | null> {
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
      views: true,
      likeCount: true,
      dislikeCount: true,
      commentCount: true,
      isFeatured: true,
    },
  });

  if (!post || post.status !== "PUBLISHED") return null;

  let userReaction: "LIKE" | "DISLIKE" | null = null;
  if (userId) {
    const reaction = await db.blogReaction.findUnique({
      where: { postId_userId: { postId: post.id, userId } },
      select: { type: true },
    });
    userReaction = reaction?.type ?? null;
  }

  // Strip the status field before returning — it is not part of BlogPostDetail
  const { status: _status, ...rest } = post;
  return { ...rest, userReaction };
}

/** Most recently published posts. */
async function getLatestPosts(limit = 10): Promise<BlogRankingCard[]> {
  return db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: RANKING_SELECT,
  });
}

async function getMostViewedPosts(limit = 5): Promise<BlogRankingCard[]> {
  return db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { views: "desc" },
    take: limit,
    select: RANKING_SELECT,
  });
}

const TRENDING_CACHE_KEY = "blog:trending:7d";
const TRENDING_TTL_SECONDS = 1200; // 20 min — recompute lazily on cache miss

/** Posts with the most views in the last 7 days. Redis cache-aside — no scheduled job. */
async function getTrendingPosts(limit = 5): Promise<BlogRankingCard[]> {
  const redis = getRedis();

  const cached = await redis.get(TRENDING_CACHE_KEY);
  if (cached) {
    // @upstash/redis auto-deserializes JSON on get() — result may already be an object
    return (typeof cached === "string" ? JSON.parse(cached) : cached) as BlogRankingCard[];
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const grouped = await db.blogView.groupBy({
    by: ["postId"],
    where: { viewedAt: { gte: sevenDaysAgo } },
    _count: { postId: true },
    orderBy: { _count: { postId: "desc" } },
    take: limit,
  });

  let ordered: BlogRankingCard[] = [];
  if (grouped.length > 0) {
    const posts = await db.blogPost.findMany({
      where: { id: { in: grouped.map((g) => g.postId) }, status: "PUBLISHED" },
      select: RANKING_SELECT,
    });
    const byId = new Map(posts.map((p) => [p.id, p]));
    ordered = grouped.map((g) => byId.get(g.postId)).filter((p): p is BlogRankingCard => !!p);
  }

  await redis.set(TRENDING_CACHE_KEY, JSON.stringify(ordered), { ex: TRENDING_TTL_SECONDS });
  return ordered;
}

/** Latest, trending (7d, Redis-cached), and most-viewed rankings for the blog hub scroller rows. */
export async function getBlogRankings(): Promise<BlogRankings> {
  const [latest, mostViewed, trending] = await Promise.all([
    getLatestPosts(10),
    getMostViewedPosts(10),
    getTrendingPosts(10),
  ]);
  return { latest, mostViewed, trending };
}
