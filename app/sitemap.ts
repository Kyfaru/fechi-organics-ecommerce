import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/queries/blog";
import { getAllProductSlugs } from "@/lib/queries/products";
import { SITE_URL } from "@/lib/site";

// Regenerate hourly so newly published products/posts show up without a redeploy.
export const revalidate = 3600;

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
  { url: `${SITE_URL}/shop`, changeFrequency: "daily", priority: 0.9 },
  { url: `${SITE_URL}/blog`, changeFrequency: "daily", priority: 0.8 },
  { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
  { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
  { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.5 },
  { url: `${SITE_URL}/testimonials`, changeFrequency: "weekly", priority: 0.5 },
  { url: `${SITE_URL}/shipping`, changeFrequency: "yearly", priority: 0.3 },
  { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  { url: `${SITE_URL}/privacy-policy`, changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, products] = await Promise.all([getPublishedPosts(), getAllProductSlugs()]);

  const postRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.publishedAt ?? undefined,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${SITE_URL}/shop/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...STATIC_ROUTES, ...postRoutes, ...productRoutes];
}
