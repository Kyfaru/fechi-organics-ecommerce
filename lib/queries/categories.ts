"use cache";

import { cacheTag, cacheLife } from "next/cache";
import { db } from "../db";
import { r2PublicUrl } from "../r2";

export type CategoryItem = {
  id: string;
  key: string;
  name: string;
  slug: string;
  imageUrl: string;
  sortOrder: number;
};

/** Fetch the 5 product categories. Cached with tag "categories". */
export async function getCategories(): Promise<CategoryItem[]> {
  "use cache";
  cacheTag("categories");
  cacheLife("hours");

  const rows = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return rows.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    slug: c.slug,
    imageUrl: r2PublicUrl(c.imageKey),
    sortOrder: c.sortOrder,
  }));
}
