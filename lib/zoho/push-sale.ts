import { db } from "@/lib/db";
import { zohoPost, type ZohoSalesOrderPayload } from "@/lib/zoho";
import { recordZohoPush } from "@/lib/zoho/push-log";

/**
 * Pushes a completed sale (online order or in-store order) to Zoho as a real
 * Sales Order. Resolves each line item's Zoho item id via productZohoMapping
 * (a direct index lookup per org — items with no mapping yet are sent
 * without an item_id, same fallback as before this was extracted).
 *
 * Re-throws on failure so each call site's own fire-and-forget `.catch()`
 * stays the single place that decides "never block the user-facing flow" —
 * this helper's job is just to push + log, not to swallow errors twice.
 */
export async function pushSaleToZoho(args: {
  organizationId: string;
  branchId?: string | null;
  referenceType: "order" | "inStoreOrder";
  referenceId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  items: Array<{ productId: string; name: string; quantity: number; priceKes: number }>;
  discountKes?: number;
  shippingKes?: number;
  notes: string;
}): Promise<{ salesorderId: string | null }> {
  const { organizationId, branchId, referenceType, referenceId, items } = args;

  try {
    const mappings = await db.productZohoMapping.findMany({
      where: { organizationId, productId: { in: items.map((i) => i.productId) } },
      select: { productId: true, zohoItemId: true },
    });
    const itemIdByProductId = new Map(mappings.map((m) => [m.productId, m.zohoItemId]));

    const soPayload: ZohoSalesOrderPayload = {
      customer_name: args.customerName ?? undefined,
      customer_email: args.customerEmail ?? undefined,
      line_items: items.map((item) => ({
        item_id: itemIdByProductId.get(item.productId) ?? undefined,
        name: item.name,
        quantity: item.quantity,
        rate: item.priceKes / 100,
      })),
      discount: args.discountKes ? args.discountKes / 100 : undefined,
      shipping_charge: args.shippingKes ? args.shippingKes / 100 : undefined,
      notes: args.notes,
    };

    const soRes = await zohoPost<{ salesorder?: { salesorder_id?: string } }>(
      organizationId,
      "/salesorders",
      { salesorder: soPayload },
    );
    const salesorderId = soRes?.salesorder?.salesorder_id ?? null;

    await recordZohoPush({
      kind: "SALES_ORDER",
      status: "SENT",
      organizationId,
      branchId,
      referenceType,
      referenceId,
      zohoRecordId: salesorderId,
    });

    return { salesorderId };
  } catch (e) {
    await recordZohoPush({
      kind: "SALES_ORDER",
      status: "FAILED",
      organizationId,
      branchId,
      referenceType,
      referenceId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
