/**
 * Central place for the cache tags used by lib/queries/*.ts ("use cache" +
 * cacheTag) so admin write paths invalidate the exact same tag strings
 * instead of each route re-typing them and risking drift.
 */

import { revalidateTag } from "next/cache";

/** Invalidate product list/detail caches. Pass the product's slug(s) — on a
 *  rename, pass both the old and new slug so neither URL serves stale data. */
export function invalidateProductCache(...slugs: (string | null | undefined)[]) {
  revalidateTag("products", "minutes");
  for (const slug of slugs) {
    if (slug) revalidateTag(`product:${slug}`, "minutes");
  }
}

/** Invalidate category list cache. Category name/slug is denormalized into
 *  cached product cards (categoryName/categorySlug), so product caches must
 *  be invalidated too or storefront listings show the old category label. */
export function invalidateCategoryCache(...categorySlugs: (string | null | undefined)[]) {
  revalidateTag("categories", "hours");
  revalidateTag("products", "minutes");
  for (const slug of categorySlugs) {
    if (slug) revalidateTag(`products:cat:${slug}`, "minutes");
  }
}

export function invalidateTestimonialCache() {
  revalidateTag("testimonials", "hours");
}
