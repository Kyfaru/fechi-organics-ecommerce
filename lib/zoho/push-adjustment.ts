import { zohoPost } from "@/lib/zoho";
import { db } from "@/lib/db";
import { recordZohoPush } from "@/lib/zoho/push-log";

/**
 * Pushes a manual stock correction (not a sale) to Zoho as an Inventory
 * Adjustment. Unlike pushSaleToZoho, this never throws — it has a single
 * fire-and-forget call site (admin/inventory/adjust) with no shared
 * re-throw contract to honor, so it just logs and returns.
 *
 * Field names below are Zoho's documented Inventory Adjustments shape but
 * are unverified against a live payload — confirm during the
 * credential-testing runbook step before trusting this in production.
 */
export async function pushInventoryAdjustmentToZoho(args: {
  organizationId: string;
  branchId: string;
  productId: string;
  quantityAdjusted: number; // signed delta, the actual applied amount
  reason: string;
  notes?: string;
  referenceNumber: string;
}): Promise<{ adjustmentId: string | null }> {
  const { organizationId, branchId, productId, quantityAdjusted, reason, notes, referenceNumber } = args;

  const mapping = await db.productZohoMapping.findUnique({
    where: { productId_organizationId: { productId, organizationId } },
    select: { zohoItemId: true },
  });

  if (!mapping) {
    await recordZohoPush({
      kind: "INVENTORY_ADJUSTMENT",
      status: "SKIPPED",
      organizationId,
      branchId,
      productId,
      referenceType: "inventoryAdjustment",
      referenceId: referenceNumber,
      errorMessage: "No Zoho item mapping for this product/organization",
    });
    return { adjustmentId: null };
  }

  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { zohoWarehouseId: true } });

  try {
    const res = await zohoPost<{ inventory_adjustment?: { inventory_adjustment_id?: string } }>(
      organizationId,
      "/inventoryadjustments",
      {
        date: new Date().toISOString().slice(0, 10),
        reason,
        reference_number: referenceNumber,
        adjustment_type: "quantity",
        line_items: [
          {
            item_id: mapping.zohoItemId,
            quantity_adjusted: quantityAdjusted,
            ...(branch?.zohoWarehouseId ? { warehouse_id: branch.zohoWarehouseId } : {}),
          },
        ],
        ...(notes ? { description: notes } : {}),
      },
    );
    const adjustmentId = res?.inventory_adjustment?.inventory_adjustment_id ?? null;

    await recordZohoPush({
      kind: "INVENTORY_ADJUSTMENT",
      status: "SENT",
      organizationId,
      branchId,
      productId,
      referenceType: "inventoryAdjustment",
      referenceId: referenceNumber,
      zohoRecordId: adjustmentId,
    });

    return { adjustmentId };
  } catch (e) {
    await recordZohoPush({
      kind: "INVENTORY_ADJUSTMENT",
      status: "FAILED",
      organizationId,
      branchId,
      productId,
      referenceType: "inventoryAdjustment",
      referenceId: referenceNumber,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return { adjustmentId: null };
  }
}
