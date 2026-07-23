import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection } from "next/server";
import { invalidateProductCache } from "@/lib/cache-tags";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertBranchAccess } from "@/lib/branch-access";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory/constants";
import { resolveZohoOrganizationId } from "@/lib/zoho/resolve-org";
import { pushInventoryAdjustmentToZoho } from "@/lib/zoho/push-adjustment";

/** POST /api/admin/inventory/adjust
 *  Body: { branchId, productId, type: "ADD"|"REMOVE"|"SET", quantity, reason, notes? }
 *  Adjusts one branch's stock row for a product. Returns the updated stock value.
 */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { inventory: ["adjust"] });
  if (denied) return denied;

  let body: {
    branchId: string;
    productId: string;
    type: "ADD" | "REMOVE" | "SET";
    quantity: number;
    reason: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  const { branchId, productId, type, quantity, reason, notes } = body;

  if (!branchId || !productId || !type || quantity == null || !reason) {
    return Err.validation("branchId, productId, type, quantity, and reason are required");
  }
  if (quantity < 0) return Err.validation("Quantity must be a non-negative number");
  if (type !== "ADD" && type !== "REMOVE" && type !== "SET") {
    return Err.validation("type must be ADD, REMOVE, or SET");
  }

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();
  const forbidden = assertBranchAccess(caller, branchId);
  if (forbidden) return forbidden;

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return Err.notFound("Product");

  const existingStock = await db.branchProductStock.findUnique({
    where: { branchId_productId: { branchId, productId } },
    select: { stock: true },
  });
  const previousStock = existingStock?.stock ?? 0;

  let newStock: number;
  if (type === "ADD") {
    newStock = previousStock + Math.floor(quantity);
  } else if (type === "REMOVE") {
    newStock = Math.max(0, previousStock - Math.floor(quantity));
  } else {
    newStock = Math.floor(quantity);
  }

  try {
    await db.branchProductStock.upsert({
      where: { branchId_productId: { branchId, productId } },
      create: { branchId, productId, stock: newStock, lastSyncedAt: new Date() },
      update: { stock: newStock, lastSyncedAt: new Date() },
    });

    console.info(`[inventory/adjust] Branch ${branchId}, product ${product.name}: ${previousStock} → ${newStock} (${type}, reason: ${reason}, notes: ${notes ?? "none"})`);
    // Product cache may include fields beyond stock (storefront doesn't gate
    // on stock, but keep this invalidation in place for anything else cached
    // under the product's slug).
    invalidateProductCache(product.slug);

    await db.auditLog.create({
      data: {
        adminProfileId: caller.id,
        action: "adjust",
        resource: "inventory",
        resourceId: productId,
        details: { branchId, type, quantity, previousStock, newStock, reason, notes },
      },
    }).catch((e) => console.error("[inventory/adjust] auditLog write failed", e));

    // Fire-and-forget: push this correction to Zoho as an Inventory
    // Adjustment (not a sale) — must never block the response. Skipped
    // entirely when the applied delta is 0 (e.g. SET to the same value).
    const delta = newStock - previousStock;
    if (delta !== 0) {
      (async () => {
        const organizationId = await resolveZohoOrganizationId(branchId);
        if (!organizationId) return;
        await pushInventoryAdjustmentToZoho({
          organizationId,
          branchId,
          productId,
          quantityAdjusted: delta,
          reason,
          notes,
          referenceNumber: `ADJ-${branchId.slice(0, 8)}-${Date.now()}`,
        });
      })().catch((e) => console.error("[inventory/adjust] Zoho adjustment push failed", e));
    }

    return ok({
      id: product.id,
      name: product.name,
      previousStock,
      newStock,
      status:
        newStock === 0 ? "out_of_stock" : newStock < LOW_STOCK_THRESHOLD ? "low_stock" : "in_stock",
    });
  } catch (e) {
    console.error("[inventory/adjust/POST]", e);
    return Err.internal(e);
  }
}
