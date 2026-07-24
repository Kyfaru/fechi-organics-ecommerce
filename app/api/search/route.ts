import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { searchStaticPages } from "@/lib/search/static-pages";

const RESULT_LIMIT = 5;

/**
 * GET /api/search?q=<query>
 *
 * Global storefront search: products, blog posts, testimonials, FAQs, and a
 * static index of content-only pages (About, Terms, Shipping, etc).
 */
export async function GET(req: NextRequest) {
  await connection();
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return ok({ results: [] });

  try {
    const [products, posts, testimonials, faqs] = await Promise.all([
      db.product.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { shortDescription: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { name: true, slug: true, shortDescription: true },
        take: RESULT_LIMIT,
      }),
      db.blogPost.findMany({
        where: {
          status: "PUBLISHED",
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { excerpt: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { title: true, slug: true, excerpt: true },
        take: RESULT_LIMIT,
      }),
      db.testimonial.findMany({
        where: { quote: { contains: q, mode: "insensitive" } },
        select: { authorName: true, quote: true },
        take: RESULT_LIMIT,
      }),
      db.faq.findMany({
        where: {
          status: "published",
          OR: [
            { question: { contains: q, mode: "insensitive" } },
            { answer: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { question: true, answer: true },
        take: RESULT_LIMIT,
      }),
    ]);

    const results = [
      ...products.map((p) => ({
        title: p.name,
        description: p.shortDescription ?? p.name,
        url: `/shop/${p.slug}?q=${encodeURIComponent(q)}`,
      })),
      ...posts.map((p) => ({
        title: p.title,
        description: p.excerpt ?? p.title,
        url: `/blog/${p.slug}?q=${encodeURIComponent(q)}`,
      })),
      ...testimonials.map((t) => ({
        title: `Testimonial — ${t.authorName}`,
        description: t.quote,
        url: `/testimonials?q=${encodeURIComponent(q)}`,
      })),
      ...faqs.map((f) => ({
        title: f.question,
        description: f.answer,
        url: `/faq?q=${encodeURIComponent(q)}`,
      })),
      ...searchStaticPages(q),
    ].slice(0, RESULT_LIMIT * 4);

    return ok({ results });
  } catch (e) {
    console.error("[search] GET error", e);
    return Err.internal(e);
  }
}
