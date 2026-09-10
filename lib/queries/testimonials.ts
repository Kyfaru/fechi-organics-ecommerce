"use cache";

import { cacheTag, cacheLife } from "next/cache";
import { db } from "../db";
import { r2PublicUrl } from "../r2";

export type TestimonialItem = {
  id: string;
  authorName: string;
  location: string | null;
  quote: string;
  rating: number;
  beforeUrl: string;
  afterUrl: string;
};

/** Approved testimonials for the home page. */
export async function getTestimonials(): Promise<TestimonialItem[]> {
  "use cache";
  cacheTag("testimonials");
  cacheLife("hours");

  const rows = await db.testimonial.findMany({
    where: { approved: true },
    orderBy: { sortOrder: "asc" },
  });

  return rows.map((t) => ({
    id: t.id,
    authorName: t.authorName,
    location: t.location,
    quote: t.quote,
    rating: t.rating,
    beforeUrl: t.beforeKey ? r2PublicUrl(t.beforeKey) : "",
    afterUrl: t.afterKey ? r2PublicUrl(t.afterKey) : "",
  }));
}

export type TestimonialsPage = {
  items: TestimonialItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Approved testimonials for the public /testimonials page, paginated.
 * Uses the SAME "testimonials" cache tag as getTestimonials() so admin
 * approve/reject/sort actions (invalidateTestimonialCache()) bust this
 * page's cache too — see app/api/admin/testimonials/[id]/route.ts.
 */
export async function getTestimonialsPaginated(
  page: number,
  pageSize = 20
): Promise<TestimonialsPage> {
  "use cache";
  cacheTag("testimonials");
  cacheLife("hours");

  // Defensive clamp — never let a bad ?page= query param produce a negative skip.
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  const [rows, total] = await Promise.all([
    db.testimonial.findMany({
      where: { approved: true },
      orderBy: { sortOrder: "asc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    }),
    db.testimonial.count({ where: { approved: true } }),
  ]);

  return {
    items: rows.map((t) => ({
      id: t.id,
      authorName: t.authorName,
      location: t.location,
      quote: t.quote,
      rating: t.rating,
      beforeUrl: t.beforeKey ? r2PublicUrl(t.beforeKey) : "",
      afterUrl: t.afterKey ? r2PublicUrl(t.afterKey) : "",
    })),
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
