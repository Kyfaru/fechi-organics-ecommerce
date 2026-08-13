import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertStagedItemOrgAccess } from "@/lib/zoho/staged-item-access";
import { slugify, uniqueSlug } from "@/lib/zoho-sync";
import { reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// POST /api/admin/zoho/staged-items/[id]/promote
// Turns a reviewed staged item into a live product + productZohoMapping,
// then removes it from the review queue. Uses the same create logic
// lib/zoho-sync.ts's syncItemToProduct used to run inline for brand-new Zoho
// items, before that path was replaced with staging (see zohoStagedItem in
// prisma/schema.prisma).
//
// Deliberately does not write branchProductStock here — the staged row's
// stockOnHand is a point-in-time snapshot from whenever the item was last
// seen in a sync, not live Zoho data. The next scheduled/manual sync will
// take the (now-mapped) product through syncItemToProduct's normal
// `if (mapping)` path and populate stock correctly; a brand-new product
// simply shows no stock until then.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { products: ["create"] });
  if (denied) return denied;

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();

  try {
    const { id } = await params;

    const staged = await db.zohoStagedItem.findUnique({ where: { id } });
    if (!staged) return Err.notFound("Staged item");

    const forbidden = await assertStagedItemOrgAccess(caller, staged.organizationId);
    if (forbidden) return forbidden;

    // Only a still-pending item can be promoted — guards against a stale
    // tab re-submitting promote on an item that's since been excluded.
    if (staged.status !== "PENDING") return Err.validation("Only pending items can be added to Products");

    const matchedCategory = staged.categoryNameRaw
      ? await db.category.findFirst({
          where: { name: { equals: staged.categoryNameRaw, mode: "insensitive" }, isActive: true },
        })
      : null;
    const category = matchedCategory ?? (await db.category.findUnique({ where: { key: "UNCATEGORIZED" } }));
    if (!category) {
      console.error(
        `[admin/zoho/staged-items/promote] No matching category and no UNCATEGORIZED fallback found for staged item ${id}. Has prisma/seed.ts been run?`,
      );
      return Err.internal();
    }

    const slug = await uniqueSlug(slugify(staged.name));

    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: staged.name,
          description: staged.description,
          slug,
          categoryId: category.id,
          // A product must have some price to exist — default to 0, same as
          // syncItemToProduct's create path, when Zoho never returned a rate.
          priceKes: staged.rateKes ?? 0,
          zohoSku: staged.sku,
          zohoItemType: staged.productType,
          zohoStatus: staged.zohoStatus,
          zohoUnit: staged.unit,
          zohoBrand: staged.brand,
          purchaseRateKes: staged.purchaseRateKes,
          zohoCategoryNameRaw: staged.categoryNameRaw,
          lastZohoSyncedAt: new Date(),
        },
      });
      await tx.productZohoMapping.create({
        data: { productId: created.id, organizationId: staged.organizationId, zohoItemId: staged.zohoItemId },
      });
      await tx.zohoStagedItem.delete({ where: { id } });
      return created;
    });

    console.info("[admin/zoho/staged-items/promote] Promoted staged item", id, "-> product", product.id);
    return ok({ id: product.id, slug: product.slug, name: product.name });
  } catch (e) {
    console.error("[admin/zoho/staged-items/promote] POST error", e);
    reportError(e, { route: "POST /api/admin/zoho/staged-items/[id]/promote", userId: caller.id });
    return Err.internal();
  }
}
