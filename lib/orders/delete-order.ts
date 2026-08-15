/**
 * Super-admin-only permanent order deletion — cascades everything connected
 * to the order (items, status events, transactions, invoice) while never
 * touching the customer (user/clientProfile) record.
 *
 * transaction/inStoreTransaction have no onDelete set on their orderId FK
 * (defaults to Restrict), so they must be deleted before the order row
 * itself or the delete throws a foreign-key violation. orderItem/
 * orderStatusEvent/inStoreOrderItem cascade automatically.
 *
 * testimonial.orderId, couponRedemption.orderId, inboxMessage.orderId, and
 * mpesaC2bTransaction.matchedInStoreTransactionId are not real FKs (no
 * relation field) — deleting the order wouldn't break them, but they'd
 * dangle. testimonial.orderId is nulled (the testimonial itself is
 * customer-authored content and survives); inboxMessage/couponRedemption
 * rows are deleted; zohoPushLog rows are left alone as a historical record.
 */

import { db } from "@/lib/db";
import type { TxClient } from "@/lib/orders/generate-order-number";
import { deleteR2Object } from "@/lib/r2";

export type OrderKind = "order" | "instore";

export async function deleteOrder(args: {
  id: string;
  kind: OrderKind;
  reason: string;
  actorAdminProfileId: string;
}): Promise<{ orderNumber: string | null; invoicePdfKey: string | null }> {
  const result = args.kind === "instore"
    ? await deleteInStoreOrder(args.id)
    : await deleteOnlineOrder(args.id);

  if (result.invoicePdfKey) {
    await deleteR2Object(result.invoicePdfKey);
  }

  return result;
}

async function deleteOnlineOrder(id: string) {
  return db.$transaction(async (tx: TxClient) => {
    const order = await tx.order.findUnique({
      where: { id },
      select: { orderNumber: true, invoicePdfKey: true },
    });
    if (!order) throw new Error("Order not found");

    await tx.testimonial.updateMany({ where: { orderId: id }, data: { orderId: null } });
    await tx.inboxMessage.deleteMany({ where: { orderId: id } });
    await tx.couponRedemption.deleteMany({ where: { orderId: id } });
    // Must precede order.delete() — transaction.orderId has no onDelete
    // (defaults to Restrict).
    await tx.transaction.deleteMany({ where: { orderId: id } });
    await tx.order.delete({ where: { id } });

    return { orderNumber: order.orderNumber, invoicePdfKey: order.invoicePdfKey };
  });
}

async function deleteInStoreOrder(id: string) {
  return db.$transaction(async (tx: TxClient) => {
    const order = await tx.inStoreOrder.findUnique({
      where: { id },
      select: { orderNumber: true, invoicePdfKey: true },
    });
    if (!order) throw new Error("Order not found");

    await tx.testimonial.updateMany({ where: { orderId: id }, data: { orderId: null } });
    await tx.inboxMessage.deleteMany({ where: { orderId: id } });
    await tx.couponRedemption.deleteMany({ where: { orderId: id } });

    const transactions = await tx.inStoreTransaction.findMany({
      where: { inStoreOrderId: id },
      select: { id: true },
    });
    // mpesaC2bTransaction.matchedInStoreTransactionId is an app-maintained
    // pointer, not a real FK — null it before the inStoreTransaction rows it
    // points at disappear, or it'd dangle silently.
    if (transactions.length) {
      await tx.mpesaC2bTransaction.updateMany({
        where: { matchedInStoreTransactionId: { in: transactions.map((t) => t.id) } },
        data: { matchedInStoreTransactionId: null },
      });
    }
    // Must precede inStoreOrder.delete() — inStoreTransaction.inStoreOrderId
    // has no onDelete (defaults to Restrict).
    await tx.inStoreTransaction.deleteMany({ where: { inStoreOrderId: id } });
    await tx.inStoreOrder.delete({ where: { id } });

    return { orderNumber: order.orderNumber, invoicePdfKey: order.invoicePdfKey };
  });
}
