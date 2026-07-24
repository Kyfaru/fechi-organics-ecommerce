/**
 * Zoho Inventory → Fechi Organics product sync
 *
 * Several branches can share one Zoho organization's catalog (see
 * lib/zoho-credentials.ts and prisma schema `zohoOrganization`/`branch`).
 * The product catalog (name/price/description/category/...) is one shared
 * row per SKU, linked to each org's own item id via `productZohoMapping`
 * (a product has a *different* zohoItemId per org, since each org's catalog
 * is independent). Stock is branch-specific and lives in
 * `branchProductStock`, keyed on (branchId, productId).
 *
 * Every mapped field is written on every sync, including nulling out fields
 * Zoho doesn't return for an item — the admin fills gaps manually rather
 * than the sync silently leaving stale or skipped data.
 *
 * Provides two exports:
 *   syncItemToProduct(organizationId, item, orgBranches) — upsert one Zoho
 *     item's catalog fields onto the shared product row, and its stock onto
 *     every branch in orgBranches.
 *   syncAllItems(organizationId)                         — paginate all of
 *     an org's Zoho items and sync each one.
 */

import { db } from "@/lib/db";
import { zohoGet, type ZohoItem } from "@/lib/zoho";
import { invalidateProductCache } from "@/lib/cache-tags";
import { createNotification } from "@/lib/notify";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory/constants";

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type OrgBranch = { id: string; zohoWarehouseId: string | null };

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

/**
 * Fires a LOW_STOCK notification when a branch's stock for a product crosses
 * below the threshold. "Crossing-edge" means we only alert once per dip, not
 * on every sync while it stays low — otherwise every 200-item page sync would
 * spam the same low-stock item repeatedly.
 *
 * Judgment call: a product with no prior branchProductStock row (first sync
 * ever, or first sync since being added to Zoho) that already comes in below
 * threshold also fires. Treating "no prior row" as "previous stock was fine"
 * would silently hide a product that's been low since before we started
 * tracking it — worse than one extra notification on initial sync.
 */
async function notifyIfCrossedLowStock(
  branchId: string,
  productId: string,
  productName: string,
  previousStock: number | null,
  newStock: number
): Promise<void> {
  const wasAboveThreshold = previousStock === null || previousStock >= LOW_STOCK_THRESHOLD;
  const isNowBelowThreshold = newStock < LOW_STOCK_THRESHOLD;
  if (!wasAboveThreshold || !isNowBelowThreshold) return;

  await createNotification({
    type: "LOW_STOCK",
    title: `Low stock: ${productName}`,
    body: `Only ${newStock} unit${newStock === 1 ? "" : "s"} left after Zoho sync.`,
    link: "/admin/inventory",
    branchId,
    // severity omitted — DEFAULT_SEVERITY["LOW_STOCK"] (WARNING) applies
  });
}

/**
 * Upserts one product's stock for every branch in orgBranches. Uses Zoho's
 * per-warehouse breakdown when a branch has a zohoWarehouseId configured and
 * the item's payload includes it; otherwise falls back to applying the org's
 * aggregate quantity_available identically to that branch (see
 * syncAllItems's one-warning-per-run notice for this fallback).
 */
async function upsertBranchStocks(
  tx: TxClient,
  productId: string,
  item: ZohoItem,
  orgBranches: OrgBranch[],
): Promise<Array<{ branchId: string; previousStock: number | null; newStock: number }>> {
  const results: Array<{ branchId: string; previousStock: number | null; newStock: number }> = [];

  for (const branch of orgBranches) {
    const warehouseEntry = branch.zohoWarehouseId
      ? item.warehouses?.find((w) => w.warehouse_id === branch.zohoWarehouseId)
      : undefined;
    const stock = warehouseEntry?.warehouse_available_stock ?? item.quantity_available ?? 0;

    const previousRow = await tx.branchProductStock.findUnique({
      where: { branchId_productId: { branchId: branch.id, productId } },
      select: { stock: true },
    });

    await tx.branchProductStock.upsert({
      where: { branchId_productId: { branchId: branch.id, productId } },
      create: { branchId: branch.id, productId, stock, lastSyncedAt: new Date() },
      update: { stock, lastSyncedAt: new Date() },
    });

    results.push({ branchId: branch.id, previousStock: previousRow?.stock ?? null, newStock: stock });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Single-item sync
// ---------------------------------------------------------------------------
/**
 * Upserts one Zoho item into the shared product catalog row (linked via
 * productZohoMapping), and its stock into every branch under this org.
 * @param organizationId - the org this item's catalog belongs to
 * @param item - the Zoho Inventory item payload
 * @param orgBranches - every branch currently linked to this organization
 */
export async function syncItemToProduct(
  organizationId: string,
  item: ZohoItem,
  orgBranches: OrgBranch[],
): Promise<void> {
  if (!item.item_id || !item.name) {
    console.warn("[zoho-sync] Item missing item_id or name — skipping", item);
    return;
  }

  const mapping = await db.productZohoMapping.findUnique({
    where: { organizationId_zohoItemId: { organizationId, zohoItemId: item.item_id } },
    select: { productId: true },
  });

  const matchedCategory = item.category_name
    ? await db.category.findFirst({
        where: { name: { equals: item.category_name, mode: "insensitive" }, isActive: true },
      })
    : null;

  const hasRate = typeof item.rate === "number" && Number.isFinite(item.rate);
  const priceKesUpdate = hasRate ? Math.round(item.rate * 100) : undefined;
  const purchaseRateKes =
    typeof item.purchase_rate === "number" && Number.isFinite(item.purchase_rate)
      ? Math.round(item.purchase_rate * 100)
      : null;

  // Every mapped field is set on every sync, nulling what Zoho doesn't
  // return — the admin fills gaps manually rather than the sync silently
  // skipping or leaving stale data (categoryId/priceKes are the deliberate
  // exceptions — see below).
  const catalogFields = {
    name: item.name,
    description: item.description ?? null,
    zohoSku: item.sku ?? null,
    zohoItemType: item.item_type ?? item.product_type ?? null,
    zohoStatus: item.status ?? null,
    zohoUnit: item.unit ?? null,
    zohoBrand: item.brand ?? null,
    purchaseRateKes,
    zohoCategoryNameRaw: item.category_name ?? null,
    lastZohoSyncedAt: new Date(),
  };

  let productId: string;
  let productSlug: string;
  let stockResults: Array<{ branchId: string; previousStock: number | null; newStock: number }>;

  if (mapping) {
    const existing = await db.product.findUnique({
      where: { id: mapping.productId },
      select: { id: true, slug: true },
    });
    if (!existing) {
      console.warn(
        `[zoho-sync] productZohoMapping points at a missing product (productId ${mapping.productId}) — skipping item ${item.item_id}`,
      );
      return;
    }

    stockResults = await db.$transaction(async (tx: TxClient) => {
      await tx.product.update({
        where: { id: existing.id },
        data: {
          ...catalogFields,
          // priceKes is non-nullable and checkout math depends on it — leave
          // untouched (not nulled/zeroed) when Zoho doesn't return a rate.
          ...(priceKesUpdate !== undefined ? { priceKes: priceKesUpdate } : {}),
          // categoryId stays required; on no name match, leave it as-is and
          // rely on zohoCategoryNameRaw (already in catalogFields) to surface
          // the mismatch for manual reconciliation.
          ...(matchedCategory ? { categoryId: matchedCategory.id } : {}),
        },
      });
      return upsertBranchStocks(tx, existing.id, item, orgBranches);
    });

    productId = existing.id;
    productSlug = existing.slug;
  } else {
    const category = matchedCategory ?? (await db.category.findUnique({ where: { key: "UNCATEGORIZED" } }));
    if (!category) {
      console.error(
        `[zoho-sync] No matching category and no UNCATEGORIZED fallback found — skipping item ${item.item_id}. Has prisma/seed.ts been run?`,
      );
      return;
    }

    const slug = await uniqueSlug(slugify(item.name));

    const created = await db.$transaction(async (tx: TxClient) => {
      const product = await tx.product.create({
        data: {
          ...catalogFields,
          slug,
          categoryId: category.id,
          // A product must have some price to exist — default to 0 on create
          // when Zoho didn't return a rate, unlike the update path.
          priceKes: priceKesUpdate ?? 0,
        },
      });
      await tx.productZohoMapping.create({
        data: { productId: product.id, organizationId, zohoItemId: item.item_id },
      });
      const results = await upsertBranchStocks(tx, product.id, item, orgBranches);
      return { product, results };
    });

    productId = created.product.id;
    productSlug = created.product.slug;
    stockResults = created.results;
  }

  invalidateProductCache(productSlug);

  for (const r of stockResults) {
    await notifyIfCrossedLowStock(r.branchId, productId, item.name, r.previousStock, r.newStock);
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

/**
 * Paginates all items in a Zoho organization's catalog and syncs each one
 * into every branch linked to that org.
 * @param organizationId - the org to sync from
 * @returns upserted: items synced this run; deactivated: branchProductStock
 *   rows (across every branch in this org) zeroed out because their item no
 *   longer appeared in the sync. Global product fields are never touched.
 */
export async function syncAllItems(organizationId: string): Promise<{
  upserted: number;
  deactivated: number;
}> {
  const orgBranches = await db.branch.findMany({
    where: { zohoOrganizationId: organizationId },
    select: { id: true, zohoWarehouseId: true },
  });

  if (orgBranches.length === 0) {
    console.warn(`[zoho-sync] No branches linked to organization ${organizationId} — nothing to sync stock into`);
  }
  const branchesWithoutWarehouse = orgBranches.filter((b) => !b.zohoWarehouseId);
  if (branchesWithoutWarehouse.length > 0) {
    console.warn(
      `[zoho-sync] ${branchesWithoutWarehouse.length} branch(es) in org ${organizationId} have no zohoWarehouseId configured — applying Zoho's aggregate quantity_available to them instead of a real per-branch number.`,
    );
  }

  let page = 1;
  let hasMore = true;
  const seenZohoIds: string[] = [];

  while (hasMore) {
    const response = await zohoGet<ZohoItemsResponse>(organizationId, "/items", {
      page: String(page),
      page_size: "200",
    });

    const items = response.items ?? [];

    for (const item of items) {
      await syncItemToProduct(organizationId, item, orgBranches);
      if (item.item_id) seenZohoIds.push(item.item_id);
    }

    hasMore = response.page_context?.has_more_page ?? false;
    page++;
  }

  // Zero out stock (every branch in this org) for any product mapped to
  // this org whose Zoho item_id was NOT returned in this sync (i.e. removed
  // from the org's Zoho catalog). Global product fields are untouched.
  const orgBranchIds = orgBranches.map((b) => b.id);
  const staleMappings = await db.productZohoMapping.findMany({
    where: {
      organizationId,
      ...(seenZohoIds.length > 0 ? { NOT: { zohoItemId: { in: seenZohoIds } } } : {}),
    },
    select: { productId: true },
  });

  let deactivated = 0;
  if (orgBranchIds.length > 0 && staleMappings.length > 0) {
    const zeroedResult = await db.branchProductStock.updateMany({
      where: {
        branchId: { in: orgBranchIds },
        productId: { in: staleMappings.map((m) => m.productId) },
        stock: { gt: 0 },
      },
      data: { stock: 0 },
    });
    deactivated = zeroedResult.count;
  }

  return {
    upserted: seenZohoIds.length,
    deactivated,
  };
}
