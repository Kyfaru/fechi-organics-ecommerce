import { db } from "@/lib/db";
import { zohoPost, type ZohoInventoryAdjustmentPayload } from "@/lib/zoho";
import { recordZohoPush } from "@/lib/zoho/push-log";

/**
 * Pushes a stock decrement to Zoho Inventory as one Inventory Adjustment
 * covering every line item in a sale — mirrors the Sales Receipt's own
 * one-record-many-line-items shape (see lib/zoho/push-sale-receipt.ts).
 *
 * Called right after a successful Sales Receipt push (Zoho Books' Sales
 * Receipts never move stock on their own — only a Shipment Order or Invoice
 * does — so this is the step that actually reduces the shelf-count in Zoho
 * Inventory, a separate product from Books on the same account).
 *
 * Never throws (self-enforced — the entire body, including its own DB
 * lookups, runs inside the try/catch below, not just the Zoho API call) —
 * matches the pre-Books-migration version of this file, since a failed
 * stock adjustment must never be allowed to undo or delay an
 * already-successful, already-recorded sale.
 */
export async function pushInventoryAdjustmentToZoho(args: {
  organizationId: string;
  branchId?: string | null;
  referenceType: "order" | "inStoreOrder";
  referenceId: string;
  referenceNumber?: string | null;
  items: Array<{ productId: string; quantity: number }>;
}): Promise<{ adjustmentId: string | null }> {
  const { organizationId, branchId, referenceType, referenceId, items } = args;

  try {
    const mappings = await db.productZohoMapping.findMany({
      where: { organizationId, productId: { in: items.map((i) => i.productId) } },
      select: { productId: true, zohoItemId: true, zohoInventoryItemId: true },
    });
    const itemIdByProduct = new Map(mappings.map((m) => [m.productId, m.zohoInventoryItemId ?? m.zohoItemId]));

    const warehouseId = branchId
      ? (await db.branch.findUnique({ where: { id: branchId }, select: { zohoWarehouseId: true } }))?.zohoWarehouseId ?? undefined
      : undefined;

    const lineItems = items
      .filter((i) => itemIdByProduct.has(i.productId))
      .map((i) => ({
        item_id: itemIdByProduct.get(i.productId)!,
        quantity_adjusted: -i.quantity,
        // Wire field is location_id (Zoho Inventory), not warehouse_id
        // (that's Zoho POS) — see the CONFIRMED note on
        // ZohoInventoryAdjustmentPayload.line_items in lib/zoho.ts. The
        // branch column stays named zohoWarehouseId (admin-facing concept),
        // only the field sent to Zoho differs.
        ...(warehouseId ? { location_id: warehouseId } : {}),
      }));

    if (lineItems.length === 0) {
      await recordZohoPush({
        kind: "INVENTORY_ADJUSTMENT",
        status: "SKIPPED",
        organizationId,
        branchId,
        referenceType,
        referenceId,
        errorMessage: "No Zoho item mapping for any product in this sale",
      });
      return { adjustmentId: null };
    }

    const payload: ZohoInventoryAdjustmentPayload = {
      date: new Date().toISOString().slice(0, 10),
      reason: "Sale",
      reference_number: args.referenceNumber ?? undefined,
      adjustment_type: "quantity",
      line_items: lineItems,
    };

    const res = await zohoPost<{ inventory_adjustment?: { inventory_adjustment_id?: string } }>(
      organizationId,
      "/inventoryadjustments",
      payload,
      "inventory",
    );
    const adjustmentId = res?.inventory_adjustment?.inventory_adjustment_id ?? null;

    await recordZohoPush({
      kind: "INVENTORY_ADJUSTMENT",
      status: "SENT",
      organizationId,
      branchId,
      referenceType,
      referenceId,
      zohoRecordId: adjustmentId,
    });

    return { adjustmentId };
  } catch (e) {
    await recordZohoPush({
      kind: "INVENTORY_ADJUSTMENT",
      status: "FAILED",
      organizationId,
      branchId,
      referenceType,
      referenceId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return { adjustmentId: null };
  }
}
