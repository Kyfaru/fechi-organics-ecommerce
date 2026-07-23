"use cache";

import { cacheTag, cacheLife } from "next/cache";
import { db } from "../db";
import { r2PublicUrl } from "../r2";

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  variantLabel: string | null;
  priceKes: number;
  compareAtPriceKes: number | null;
  bestSeller: boolean;
  ratingAvg: number;
  ratingCount: number;
  primaryImageUrl: string;
  categoryName: string;
  categorySlug: string;
  stock: number;
};

export type ProductDetail = ProductCard & {
  description: string;
  sizes: string[];
  howToUse: string | null;
  ingredients: string | null;
  images: { url: string; alt: string; isPrimary: boolean }[];
};

function toCard(p: {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  variantLabel: string | null;
  priceKes: number;
  compareAtPriceKes: number | null;
  bestSeller: boolean;
  ratingAvg: number;
  ratingCount: number;
  stock: number;
  images: { objectKey: string; isPrimary: boolean }[];
  category: { name: string; slug: string };
}): ProductCard {
  const primary = p.images.find((i) => i.isPrimary) ?? p.images[0];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    variantLabel: p.variantLabel,
    priceKes: p.priceKes,
    compareAtPriceKes: p.compareAtPriceKes,
    bestSeller: p.bestSeller,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    primaryImageUrl: primary ? r2PublicUrl(primary.objectKey) : "/img/placeholder.png",
    categoryName: p.category.name,
    categorySlug: p.category.slug,
    stock: p.stock,
  };
}

const IMAGE_INCLUDE = {
  images: { orderBy: { sortOrder: "asc" as const } },
  category: { select: { name: true, slug: true } },
};

/** Best-selling products for the home page. */
export async function getBestSellers(limit = 4): Promise<ProductCard[]> {
  "use cache";
  cacheTag("products");
  cacheLife("minutes");

  const rows = await db.product.findMany({
    where: { isActive: true, bestSeller: true },
    orderBy: { ratingCount: "desc" },
    take: limit,
    include: IMAGE_INCLUDE,
  });
  return rows.map(toCard);
}

/** Paginated product list for the shop page. */
export async function getProducts(opts: {
  category?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "best";
  cursor?: string;
  limit?: number;
}): Promise<{ items: ProductCard[]; nextCursor: string | null }> {
  "use cache";
  cacheTag("products");
  if (opts.category) cacheTag(`products:cat:${opts.category}`);
  cacheLife("minutes");

  const limit = opts.limit ?? 12;
  const orderBy =
    opts.sort === "price_asc"
      ? { priceKes: "asc" as const }
      : opts.sort === "price_desc"
        ? { priceKes: "desc" as const }
        : opts.sort === "best"
          ? { ratingCount: "desc" as const }
          : { createdAt: "desc" as const };

  const categoryFilter = opts.category
    ? { category: { slug: opts.category } }
    : {};

  const rows = await db.product.findMany({
    where: { isActive: true, ...categoryFilter },
    orderBy,
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: IMAGE_INCLUDE,
  });

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toCard);
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/** Slugs + last-modified timestamps for every active product, for the sitemap. */
export async function getAllProductSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  "use cache";
  cacheTag("products");
  cacheLife("minutes");

  return db.product.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
  });
}

/** Single product detail. */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheTag(`product:${slug}`);
  cacheLife("minutes");

  const p = await db.product.findUnique({
    where: { slug, isActive: true },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      category: { select: { name: true, slug: true } },
    },
  });
  if (!p) return null;

  return {
    ...toCard(p),
    // Zoho sync nulls description when Zoho doesn't provide one (visible as
    // a gap in the admin view) — the public storefront has no use for that
    // distinction, so it just reads as empty here.
    description: p.description ?? "",
    sizes: p.sizes,
    howToUse: p.howToUse,
    ingredients: p.ingredients,
    images: p.images.map((i) => ({
      url: r2PublicUrl(i.objectKey),
      alt: i.alt || p.name,
      isPrimary: i.isPrimary,
    })),
  };
}
