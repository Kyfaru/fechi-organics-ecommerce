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
