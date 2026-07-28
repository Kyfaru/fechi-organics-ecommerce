import { db } from "@/lib/db";
import { zohoPost, type ZohoSalesReceiptPayload } from "@/lib/zoho";
import { resolveZohoCustomer } from "@/lib/zoho/resolve-customer";
import { recordZohoPush } from "@/lib/zoho/push-log";

/**
 * Pushes a completed sale (online order or in-store order) to Zoho Books as
 * a real Sales Receipt — Books' "sell + record payment simultaneously"
 * object, so the sale is already marked paid with no separate Customer
 * Payment step. Resolves each line item's Zoho item id via
 * productZohoMapping (a direct index lookup per org — items with no mapping
 * yet are sent without an item_id, same fallback as before this was
 * extracted), and resolves/creates a Zoho Books Contact for customer_id.
 *
 * Re-throws on failure so each call site's own fire-and-forget `.catch()`
 * stays the single place that decides "never block the user-facing flow" —
 * this helper's job is just to push + log, not to swallow errors twice.
 */
export async function pushSaleReceiptToZoho(args: {
  organizationId: string;
  branchId?: string | null;
  referenceType: "order" | "inStoreOrder";
  referenceId: string;
  referenceNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  paymentMode: string;
  items: Array<{ productId: string; name: string; quantity: number; priceKes: number }>;
  discountKes?: number;
  shippingKes?: number;
  notes: string;
}): Promise<{ salesReceiptId: string | null }> {
  const { organizationId, branchId, referenceType, referenceId, items } = args;

  try {
    const mappings = await db.productZohoMapping.findMany({
      where: { organizationId, productId: { in: items.map((i) => i.productId) } },
      select: { productId: true, zohoItemId: true },
    });
    const itemIdByProductId = new Map(mappings.map((m) => [m.productId, m.zohoItemId]));

    const { contactId } = await resolveZohoCustomer(organizationId, {
      email: args.customerEmail,
      name: args.customerName,
    });

    // No top-level discount/shipping_charge fields on Sales Receipts are
    // confirmed in Zoho's docs — fold them into notes so the amounts aren't
    // silently dropped, pending live verification of real field names.
    const extraNotes = [
      args.discountKes ? `Discount: KES ${(args.discountKes / 100).toFixed(2)}` : null,
      args.shippingKes ? `Shipping: KES ${(args.shippingKes / 100).toFixed(2)}` : null,
    ].filter(Boolean);
    const notes = [args.notes, ...extraNotes].filter(Boolean).join(" | ");

    const payload: ZohoSalesReceiptPayload = {
      customer_id: contactId,
      payment_mode: args.paymentMode,
      date: new Date().toISOString().slice(0, 10),
      line_items: items.map((item) => ({
        item_id: itemIdByProductId.get(item.productId) ?? undefined,
        name: item.name,
        quantity: item.quantity,
        rate: item.priceKes / 100,
      })),
      reference_number: args.referenceNumber ?? undefined,
      notes,
    };

    // UNVERIFIED — response is expected to wrap the created record under a
    // "salesreceipt" key per Zoho's usual response convention (the request
    // body itself is sent flat, per Books' documented example). Confirm
    // both against a live call.
    const res = await zohoPost<{ salesreceipt?: { salesreceipt_id?: string } }>(
      organizationId,
      "/salesreceipts",
      payload,
    );
    const salesReceiptId = res?.salesreceipt?.salesreceipt_id ?? null;

    await recordZohoPush({
      kind: "SALES_RECEIPT",
      status: "SENT",
      organizationId,
      branchId,
      referenceType,
      referenceId,
      zohoRecordId: salesReceiptId,
    });

    return { salesReceiptId };
  } catch (e) {
    await recordZohoPush({
      kind: "SALES_RECEIPT",
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
