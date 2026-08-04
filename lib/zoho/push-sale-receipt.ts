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
  customerPhone?: string | null;
  paymentMode: string;
  items: Array<{ productId: string; name: string; quantity: number; priceKes: number }>;
  discountKes?: number;
  shippingKes?: number;
  // Delivery destination, formatted "town/building/estate, zone, county" —
  // pass whatever's known, blanks are dropped rather than left as empty segments.
  deliveryTown?: string | null;
  deliveryZoneLabel?: string | null;
  deliveryCounty?: string | null;
  // International orders only — folded into billing_address (state/zip/country)
  // rather than the line-item title, since Kenya orders already cover their
  // location via deliveryTown/deliveryZoneLabel/deliveryCounty above.
  isInternational?: boolean;
  deliveryState?: string | null;
  deliveryPostalCode?: string | null;
  deliveryCountryName?: string | null;
  // Gateway reference (M-Pesa receipt number, or the Paystack reference for
  // card payments), folded into reference_number alongside the order number
  // — unless the caller omits referenceNumber (card payments), in which case
  // this is the whole reference_number.
  paymentReference?: string | null;
  notes: string;
}): Promise<{ salesReceiptId: string | null }> {
  const { organizationId, branchId, referenceType, referenceId, items } = args;

  try {
    const mappings = await db.productZohoMapping.findMany({
      where: { organizationId, productId: { in: items.map((i) => i.productId) } },
      select: { productId: true, zohoItemId: true },
    });
    const itemIdByProductId = new Map(mappings.map((m) => [m.productId, m.zohoItemId]));

    const branch = branchId
      ? await db.branch.findUnique({ where: { id: branchId }, select: { zohoLocationId: true } })
      : null;

    const { contactId } = await resolveZohoCustomer(organizationId, {
      email: args.customerEmail,
      name: args.customerName,
    });

    // No top-level discount field is confirmed in Zoho's docs — fold it into
    // notes so the amount isn't silently dropped, pending live verification
    // of the real field name. Shipping is itemized as a line item below
    // instead, so the receipt's own total already includes it.
    const extraNotes = [
      args.discountKes ? `Discount: KES ${(args.discountKes / 100).toFixed(2)}` : null,
    ].filter(Boolean);
    const notes = [args.notes, ...extraNotes].filter(Boolean).join(" | ");

    const deliveryTitleParts = [args.deliveryTown, args.deliveryZoneLabel, args.deliveryCounty].filter(
      (p): p is string => !!p && p.trim().length > 0,
    );
    const deliveryLineItem =
      args.shippingKes && args.shippingKes > 0
        ? [
            {
              name: deliveryTitleParts.length > 0 ? `Delivery to ${deliveryTitleParts.join(", ")}` : "Delivery",
              quantity: 1,
              rate: args.shippingKes / 100,
              location_id: branch?.zohoLocationId ?? undefined,
            },
          ]
        : [];

    const referenceNumber = [args.referenceNumber, args.paymentReference].filter(Boolean).join(" / ") || undefined;

    const payload: ZohoSalesReceiptPayload = {
      customer_id: contactId,
      payment_mode: args.paymentMode,
      date: new Date().toISOString().slice(0, 10),
      line_items: [
        ...items.map((item) => ({
          item_id: itemIdByProductId.get(item.productId) ?? undefined,
          name: item.name,
          quantity: item.quantity,
          rate: item.priceKes / 100,
          // Set per line item, not at the transaction level — see the
          // CONFIRMED note on ZohoSalesReceiptPayload.line_items in lib/zoho.ts.
          location_id: branch?.zohoLocationId ?? undefined,
        })),
        ...deliveryLineItem,
      ],
      reference_number: referenceNumber,
      notes,
      billing_address:
        args.customerName || args.customerPhone
          ? {
              attention: [args.customerName, args.customerPhone].filter(Boolean).join(", ") || undefined,
              phone: args.customerPhone ?? undefined,
              ...(args.isInternational
                ? {
                    address: args.deliveryTown ?? undefined,
                    state: args.deliveryState ?? undefined,
                    zip: args.deliveryPostalCode ?? undefined,
                    country: args.deliveryCountryName ?? undefined,
                  }
                : {}),
            }
          : undefined,
    };

    // Response wraps the created record under "sales_receipt" (snake_case) —
    // confirmed via a real Zoho Books webhook payload example showing
    // { "sales_receipt": { "sales_receipt_id": ... } }; the request body
    // itself is sent flat, per Books' documented create example.
    const res = await zohoPost<{ sales_receipt?: { sales_receipt_id?: string } }>(
      organizationId,
      "/salesreceipts",
      payload,
    );
    const salesReceiptId = res?.sales_receipt?.sales_receipt_id ?? null;

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
