/**
 * Zoho Inventory → Fechi Organics product sync
 *
 * Provides two exports:
 *   syncItemToProduct(item)  — upsert a single Zoho item into the product table
 *   syncAllItems()           — paginate all Zoho items and sync each one
 */

import { db } from "@/lib/db";
import { zohoGet, type ZohoItem } from "@/lib/zoho";
import { invalidateProductCache } from "@/lib/cache-tags";

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // strip non-alphanumeric
    .replace(/[\s_]+/g, "-")      // spaces → hyphens
    .replace(/-{2,}/g, "-")       // collapse multiple hyphens
    .replace(/^-|-$/g, "");       // trim leading/trailing hyphens
}

/** Generate a unique slug, appending a numeric suffix on collision. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let attempt = 0;

  for (;;) {
    const existing = await db.product.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ---------------------------------------------------------------------------
// Single-item sync
// ---------------------------------------------------------------------------
export async function syncItemToProduct(item: ZohoItem): Promise<void> {
  const isActive = item.status === "active";
  const priceKes = Math.round(item.rate * 100); // Zoho rate is in KES units
  const stock = item.quantity_available ?? 0;

  // Try to match category by name (case-insensitive)
  let category = item.category_name
    ? await db.category.findFirst({
        where: {
          name: { equals: item.category_name, mode: "insensitive" },
          isActive: true,
        },
      })
    : null;

  // Fallback: first active category
  if (!category) {
    category = await db.category.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  if (!category) {
    console.warn(
      `[zoho-sync] No active category found for item ${item.item_id} — skipping`
    );
    return;
  }

  // Check if product already exists (for slug uniqueness)
  const existing = await db.product.findUnique({
    where: { zohoItemId: item.item_id },
    select: { id: true, slug: true },
  });

  const baseSlug = slugify(item.name);

  if (existing) {
    // Update existing product
    await db.product.update({
      where: { id: existing.id },
      data: {
        name: item.name,
        priceKes,
        stock,
        isActive,
        description: item.description ?? "",
      },
    });
    invalidateProductCache(existing.slug);
  } else {
    // Create new product
    const slug = await uniqueSlug(baseSlug);

    await db.product.create({
      data: {
        zohoItemId: item.item_id,
        name: item.name,
        slug,
        description: item.description ?? "",
        categoryId: category.id,
        priceKes,
        stock,
        isActive,
      },
    });
    invalidateProductCache(slug);
  }
}

// ---------------------------------------------------------------------------
// Paginated full sync
// ---------------------------------------------------------------------------
type ZohoItemsResponse = {
  items: ZohoItem[];
  page_context?: {
    has_more_page: boolean;
    page: number;
  };
};

export async function syncAllItems(): Promise<{
  upserted: number;
  deactivated: number;
}> {
  let page = 1;
  let hasMore = true;
  const seenZohoIds: string[] = [];

  while (hasMore) {
    const response = await zohoGet<ZohoItemsResponse>("/items", {
      page: String(page),
      page_size: "200",
    });

    const items = response.items ?? [];

    for (const item of items) {
      await syncItemToProduct(item);
      seenZohoIds.push(item.item_id);
    }

    hasMore = response.page_context?.has_more_page ?? false;
    page++;
  }

  // Deactivate any products whose Zoho item_id was NOT returned in this sync
  // (i.e., items deleted from Zoho)
  const deactivateResult = await db.product.updateMany({
    where: {
      zohoItemId: { not: null },
      ...(seenZohoIds.length > 0
        ? { NOT: { zohoItemId: { in: seenZohoIds } } }
        : {}),
      isActive: true,
    },
    data: { isActive: false },
  });

  if (deactivateResult.count > 0) {
    // Bulk deactivation bypasses syncItemToProduct's per-slug invalidation —
    // invalidate the shared list tag so removed items drop off storefront listings.
    invalidateProductCache();
  }

  return {
    upserted: seenZohoIds.length,
    deactivated: deactivateResult.count,
  };
}
