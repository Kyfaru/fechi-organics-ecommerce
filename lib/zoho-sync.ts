/**
 * Zoho Books → Fechi Organics product sync
 *
 * Several branches can share one Zoho organization's catalog (see
 * lib/zoho-credentials.ts and prisma schema `zohoOrganization`/`branch`).
 * The product catalog (name/price/description/category/...) is one shared
 * row per SKU, linked to each org's own item id via `productZohoMapping`
 * (a product has a *different* zohoItemId per org, since each org's catalog
 * is independent). Stock is branch-specific and lives in
 * `branchProductStock`, keyed on (branchId, productId) — every branch under
 * an org currently receives the same org-level aggregate stock number (no
 * per-branch/location splitting).
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

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { zohoGet, type ZohoItem } from "@/lib/zoho";
import { invalidateProductCache } from "@/lib/cache-tags";
import { createNotification } from "@/lib/notify";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory/constants";

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type OrgBranch = { id: string };

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
export async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
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
// Staged-item mapping
// ---------------------------------------------------------------------------
/**
 * Maps a raw Zoho item onto zohoStagedItem's flattened review-queue fields.
 * Mirrors the same field derivation `catalogFields`/`purchaseRateKes` use
 * below for the mapped-product path, so a promoted staged item and a
 * directly-mapped product end up with identical values for the same Zoho
 * item — the only structural difference is which table they land in.
 */
function mapZohoItemToStagedFields(item: ZohoItem) {
  const hasRate = typeof item.rate === "number" && Number.isFinite(item.rate);
  const purchaseRateKes =
    typeof item.purchase_rate === "number" && Number.isFinite(item.purchase_rate)
      ? Math.round(item.purchase_rate * 100)
      : null;

  return {
    name: item.name,
    description: item.description ?? null,
    sku: item.sku ?? null,
    productType: item.product_type ?? null,
    zohoStatus: item.status ?? null,
    unit: item.unit ?? null,
    brand: item.brand ?? null,
    rateKes: hasRate ? Math.round(item.rate * 100) : null,
    purchaseRateKes,
    categoryNameRaw: item.category_name ?? null,
    // Same field/fallback upsertBranchStocks reads for the mapped-product
    // path (item.stock_on_hand is itself UNVERIFIED — see lib/zoho.ts) —
    // null here (not 0) so "Zoho returned nothing" stays distinguishable
    // from "Zoho returned a real zero" in the review queue.
    stockOnHand: item.stock_on_hand ?? null,
    rawPayload: item as unknown as Prisma.InputJsonValue,
  };
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
 * Upserts one product's stock for every branch in orgBranches. Every branch
 * under the org receives the same org-level aggregate stock number — no
 * per-branch/location splitting (see lib/zoho.ts's ZohoItem.locations for the
 * unused per-location capability, kept in case it's wanted later).
 */
async function upsertBranchStocks(
  tx: TxClient,
  productId: string,
  item: ZohoItem,
  orgBranches: OrgBranch[],
): Promise<Array<{ branchId: string; previousStock: number | null; newStock: number }>> {
  const results: Array<{ branchId: string; previousStock: number | null; newStock: number }> = [];
  // item.stock_on_hand is itself an UNVERIFIED field name (see lib/zoho.ts) —
  // distinguish "Zoho didn't return this field at all" (likely the wrong
  // field name, worth investigating) from "Zoho returned a real 0" (item is
  // genuinely out of stock), since both currently write the same 0 below.
  if (item.stock_on_hand === undefined) {
    console.warn(
      `[zoho-sync] item ${item.item_id} ("${item.name}") has no stock_on_hand field in the Books response — writing 0 stock. If this fires for every item, stock_on_hand is likely the wrong field name (see the UNVERIFIED comment on ZohoItem in lib/zoho.ts).`,
    );
  }
  const stock = item.stock_on_hand ?? 0;

  for (const branch of orgBranches) {
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
 * @param item - the Zoho Books item payload
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
    zohoItemType: item.product_type ?? null,
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
    // No product mapping yet for this Zoho item. Never auto-create a live
    // product from an unreviewed Zoho item — stage it for admin review
    // instead (see prisma/schema.prisma's zohoStagedItem doc comment), and
    // return early: nothing below this branch (cache invalidation, stock
    // writes, low-stock notifications) applies to a product that doesn't
    // exist yet.
    const existingStaged = await db.zohoStagedItem.findUnique({
      where: { organizationId_zohoItemId: { organizationId, zohoItemId: item.item_id } },
      select: { status: true },
    });

    // Permanent guard — an admin explicitly excluded this item, so it must
    // never resurface in the review queue just because it's still present
    // (or re-appeared) in the Zoho catalog on a later sync.
    if (existingStaged?.status === "EXCLUDED") return;

    await db.zohoStagedItem.upsert({
      where: { organizationId_zohoItemId: { organizationId, zohoItemId: item.item_id } },
      create: { organizationId, zohoItemId: item.item_id, status: "PENDING", ...mapZohoItemToStagedFields(item) },
      update: mapZohoItemToStagedFields(item), // lastSeenAt bumps via @updatedAt; status untouched so a still-PENDING row stays PENDING
    });
    return;
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
    select: { id: true },
  });

  if (orgBranches.length === 0) {
    console.warn(`[zoho-sync] No branches linked to organization ${organizationId} — nothing to sync stock into`);
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

// ---------------------------------------------------------------------------
// Inventory item-id sync — additive, doesn't touch the Books-sourced sync
// above (that stays the source of truth for catalog fields and the Sales
// Receipt item id). This just backfills productZohoMapping.zohoInventoryItemId
// so lib/zoho/push-adjustment.ts's automatic stock deduction can target the
// right Inventory item — falls back to the Books item id when a product
// hasn't been matched yet (or never needs to be, if the two products'
// item ids happen to coincide for this account).
// ---------------------------------------------------------------------------
/**
 * Paginates Zoho Inventory's catalog (a separate product from Books, same
 * account) and matches each item to an existing product by SKU — the two
 * products' item ids are independent/opaque, but the same physical product
 * is expected to carry the same SKU in both catalogs. Only updates products
 * that already have a Books-sourced productZohoMapping row (via
 * syncAllItems/syncItemToProduct) — this sync attaches an Inventory id to an
 * existing mapping, it doesn't create products or mappings on its own.
 */
export async function syncInventoryIds(organizationId: string): Promise<{
  matched: number;
  unmatched: number;
}> {
  let page = 1;
  let hasMore = true;
  let matched = 0;
  let unmatched = 0;

  while (hasMore) {
    const response = await zohoGet<ZohoItemsResponse>(
      organizationId,
      "/items",
      { page: String(page), page_size: "200" },
      "inventory",
    );
    const items = response.items ?? [];

    for (const item of items) {
      if (!item.item_id || !item.sku) {
        unmatched++;
        continue;
      }

      const product = await db.product.findFirst({
        where: { zohoSku: item.sku },
        select: { id: true },
      });
      if (!product) {
        unmatched++;
        continue;
      }

      const result = await db.productZohoMapping.updateMany({
        where: { productId: product.id, organizationId },
        data: { zohoInventoryItemId: item.item_id },
      });
      if (result.count > 0) matched++;
      else unmatched++; // no Books-sourced mapping exists yet for this product/org
    }

    hasMore = response.page_context?.has_more_page ?? false;
    page++;
  }

  return { matched, unmatched };
}
