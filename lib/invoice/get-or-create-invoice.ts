import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { r2Client, r2PublicUrl } from "@/lib/r2";
import { renderInvoicePdfBuffer } from "@/lib/pdf/InvoiceDocument";

const INVOICE_INCLUDE = {
  items: true,
  user: { select: { name: true, email: true } },
  branch: { select: { name: true, county: true, address: true } },
  transactions: { orderBy: { updatedAt: "desc" as const } },
} as const;

/**
 * Returns the cached R2 URL (+ PDF bytes) for an order's invoice, generating
 * and uploading it on first call. Every caller (delayed email worker, admin
 * "print", customer "download") goes through here so the PDF is only ever
 * rendered once per order.
 */
export async function getOrCreateInvoice(
  orderId: string,
): Promise<{ url: string; invoiceNumber: string; buffer: Buffer } | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: INVOICE_INCLUDE,
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
    ? order.orderNumber.replace("#FO-", "INV-")
    : `INV-${order.id.slice(0, 8).toUpperCase()}`);

  const branch = order.branch ?? await db.branch.findFirst({
    where: { isMain: true },
    select: { name: true, county: true, address: true },
  });

  const buffer = renderInvoicePdfBuffer({
    id: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber,
    createdAt: order.createdAt,
    subtotalKes: order.subtotalKes,
    deliveryKes: order.deliveryKes,
    discountKes: order.discountKes,
    totalKes: order.totalKes,
    deliveryType: order.deliveryType,
    deliveryAddress: order.deliveryAddress,
    deliveryCity: order.deliveryCity,
    deliveryCounty: order.deliveryCounty,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, priceKes: item.priceKes })),
    user: order.user,
    guestEmail: order.guestEmail,
    branch,
    transactions: order.transactions.map((t) => ({
      provider: t.provider,
      status: t.status,
      mpesaReceiptNumber: t.mpesaReceiptNumber,
      updatedAt: t.updatedAt,
    })),
  });

  const objectKey = `invoices/${order.id}.pdf`;
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: objectKey,
    Body: buffer,
    ContentType: "application/pdf",
  }));

  await db.order.update({
    where: { id: order.id },
    data: { invoiceNumber, invoicePdfKey: objectKey },
  });

  return { url: r2PublicUrl(objectKey), invoiceNumber, buffer };
}
