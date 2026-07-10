import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { r2Client, r2PublicUrl } from "@/lib/r2";
import { renderInvoicePdfBuffer } from "@/lib/pdf/InvoiceDocument";

const INSTORE_INVOICE_INCLUDE = {
  items: true,
  branch: { select: { name: true, county: true, address: true } },
} as const;

// The invoice PDF's PROVIDER_LABELS only recognizes "MPESA"/"PAYSTACK"/"KCB" —
// both in-store M-Pesa transaction shapes (STK push and till/C2B) collapse to
// the same "MPESA" label so the printed receipt reads "M-Pesa" either way.
const PROVIDER_TO_INVOICE_LABEL: Record<string, string> = {
  MPESA_STK: "MPESA",
  MPESA_C2B: "MPESA",
  PAYSTACK: "PAYSTACK",
};

/**
 * Returns the cached R2 URL (+ PDF bytes) for an in-store order's invoice,
 * generating and uploading it on first call. Mirrors
 * lib/invoice/get-or-create-invoice.ts (the customer-flow generator) but
 * reads from the inStoreOrder tables and uploads under a distinct
 * "invoices/instore-*" key prefix so the two flows' objects never collide.
 *
 * @param inStoreOrderId - The inStoreOrder.id to generate/fetch an invoice for.
 * @returns { url, invoiceNumber, buffer } or null if the order doesn't exist.
 */
export async function getOrCreateInStoreInvoice(
  inStoreOrderId: string,
): Promise<{ url: string; invoiceNumber: string; buffer: Buffer } | null> {
  const order = await db.inStoreOrder.findUnique({
    where: { id: inStoreOrderId },
    include: INSTORE_INVOICE_INCLUDE,
  });
  if (!order) return null;

  if (order.invoicePdfKey && order.invoiceNumber) {
    const object = await r2Client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: order.invoicePdfKey,
    }));
    const bytes = await object.Body!.transformToByteArray();
    return { url: r2PublicUrl(order.invoicePdfKey), invoiceNumber: order.invoiceNumber, buffer: Buffer.from(bytes) };
  }

  const invoiceNumber = order.invoiceNumber ?? (order.orderNumber
    ? order.orderNumber.replace("#STORE-", "INV-STORE-")
    : `INV-STORE-${order.id.slice(-1, 11).toUpperCase()}`);

  const transactions = await db.inStoreTransaction.findMany({
    where: { inStoreOrderId, status: "SUCCESS" },
    orderBy: { updatedAt: "desc" },
  });

  const buffer = renderInvoicePdfBuffer({
    id: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber,
    createdAt: order.createdAt,
    subtotalKes: order.subtotalKes,
    // In-store orders are always walk-in pickups — there's no delivery leg.
    deliveryKes: 0,
    discountKes: order.discountKes,
    totalKes: order.totalKes,
    deliveryType: "PICKUP",
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, priceKes: item.priceKes })),
    user: order.customerName ? { name: order.customerName, email: order.customerEmail ?? "" } : null,
    guestEmail: null,
    branch: order.branch,
    transactions: transactions.map((t) => ({
      provider: PROVIDER_TO_INVOICE_LABEL[t.provider] ?? t.provider,
      status: t.status,
      mpesaReceiptNumber: t.mpesaReceiptNumber,
      updatedAt: t.updatedAt,
    })),
  });

  const objectKey = `invoices/instore-${order.id}.pdf`;
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: objectKey,
    Body: buffer,
    ContentType: "application/pdf",
  }));

  await db.inStoreOrder.update({
    where: { id: order.id },
    data: { invoiceNumber, invoicePdfKey: objectKey },
  });

  return { url: r2PublicUrl(objectKey), invoiceNumber, buffer };
}
