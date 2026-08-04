import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publishQstashJSON } from "@/lib/qstash";
import { getRedis } from "@/lib/redis";
import { paymentChannel } from "@/lib/payment-channel";
import { generateOrderNumber, type TxClient } from "@/lib/orders/generate-order-number";
import { pushSaleReceiptToZoho } from "@/lib/zoho/push-sale-receipt";
import { resolveZohoOrganizationId } from "@/lib/zoho/resolve-org";
import { paymentModeForOnline } from "@/lib/zoho/payment-mode";

export async function markPaymentSuccess(args: {
  transactionId: string;
  transactionData: Prisma.transactionUpdateInput;
  orderId: string;
}) {
  const result = await db.$transaction(async (tx: TxClient) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: args.transactionId },
      select: { status: true, provider: true },
    });
    if (!transaction || transaction.status !== "PENDING") return null;

    // Orders created via mpesa/paystack initiate don't have an orderNumber yet
    // (it used to be assigned only on manual admin confirmation) — assign one
    // now, the instant payment succeeds, so it's ready as soon as the order is.
    const existing = await tx.order.findUnique({
      where: { id: args.orderId },
      select: { orderNumber: true },
    });
    const orderNumber = existing?.orderNumber ?? (await generateOrderNumber(tx));

    const order = await tx.order.update({
      where: { id: args.orderId },
      data: { paymentStatus: "PAID", status: "CONFIRMED", orderNumber },
      include: { items: true, user: { select: { id: true, name: true, email: true } } },
    });

    const updatedTransaction = await tx.transaction.update({
      where: { id: args.transactionId },
      data: args.transactionData,
      select: { mpesaReceiptNumber: true },
    });

    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    if (order.userId) {
      const cart = await tx.cart.findUnique({ where: { userId: order.userId } });
      if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    return { order, provider: transaction.provider, mpesaReceiptNumber: updatedTransaction?.mpesaReceiptNumber ?? null };
  });

  await publishQstashJSON("/api/admin/workers/send-order-confirmation", { orderId: args.orderId });
  await publishQstashJSON("/api/admin/workers/notify-admin-new-order", { orderId: args.orderId });
  // Invoice PDF + email follow ~1 minute later, as a separate, quieter
  // background step after the instant confirmation email above.
  await publishQstashJSON("/api/admin/workers/generate-invoice", { orderId: args.orderId }, { delay: 60 });

  // Notify waiting SSE stream — must not throw if Redis is unavailable
  try {
    await getRedis().set(
      paymentChannel(args.orderId),
      JSON.stringify({ type: "payment_success", orderId: args.orderId, transactionId: args.transactionId, timestamp: Date.now() }),
      { ex: 900 }
    );
  } catch (e) {
    console.error("[post-payment] Redis set failed (success):", e);
  }

  // Fire-and-forget: push this now-confirmed-paid sale to Zoho as a Sales
  // Receipt. Guarded by `result` so a late/duplicate callback that hit the
  // idempotency guard above (transaction already non-PENDING) doesn't push
  // the same sale to Zoho twice. Online checkout (mpesa/kcb/paystack
  // initiate routes) already resolves a real branch from the delivery
  // address and stores it on order.branchId — use that directly, so the
  // Sales Receipt's location matches where the order actually belongs
  // instead of always attributing to one hardcoded "main" branch. Skip
  // silently (rather than failing an otherwise-successful payment) if the
  // order somehow has no branch, or that branch isn't linked to a Zoho org.
  if (result) {
    const { order, provider, mpesaReceiptNumber } = result;
    (async () => {
      try {
        if (!order.branchId) {
          console.warn("[post-payment] Order has no branchId — skipping Zoho sales receipt push for", order.id);
          return;
        }
        const organizationId = await resolveZohoOrganizationId(order.branchId);
        if (!organizationId) {
          console.warn("[post-payment] Order's branch isn't linked to a Zoho organization — skipping push for", order.id);
          return;
        }

        const { salesReceiptId } = await pushSaleReceiptToZoho({
          organizationId,
          branchId: order.branchId,
          referenceType: "order",
          referenceId: order.id,
          referenceNumber: order.orderNumber,
          customerName: order.user?.name,
          customerEmail: order.user?.email,
          customerPhone: order.deliveryPhone,
          paymentMode: paymentModeForOnline(provider),
          items: order.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            priceKes: item.priceKes,
          })),
          discountKes: order.discountKes,
          shippingKes: order.deliveryKes,
          deliveryTown: order.deliveryAddress,
          deliveryZoneLabel: order.deliveryZone,
          deliveryCounty: order.deliveryCounty,
          paymentReference: mpesaReceiptNumber,
          notes: `Fechi Organics order ${order.orderNumber ?? order.id}`,
        });

        if (salesReceiptId) {
          await db.order.update({
            where: { id: order.id },
            data: { zohoSoId: salesReceiptId },
          });
        }

        // NOTE: no separate Inventory Adjustment call here anymore.
        // Confirmed via a live productZohoMapping check (zohoInventoryItemId
        // was null, falling back to the same zohoItemId the Sales Receipt
        // above already used) plus the item-level location_id requirement
        // (error 27520) that this org's Sales Receipts already move real
        // stock on their own — this account has full Zoho Inventory wired
        // in, not just plain Books. Calling pushInventoryAdjustmentToZoho
        // here was double-decrementing the same item. See
        // lib/zoho/push-adjustment.ts's own docstring for the manual-only
        // use case that function still serves.
      } catch (e) {
        console.error("[post-payment] Zoho sales receipt push failed for order", order.id, e);
      }
    })();
  }
}

export async function markPaymentFailed(args: {
  transactionId: string;
  orderId: string;
  reason?: string;
}) {
  await db.$transaction(async (tx: TxClient) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: args.transactionId },
      select: { status: true },
    });
    // Idempotency guard: a late timeout job can fire after the payment already
    // succeeded (or already failed) via callback — don't clobber that outcome.
    if (!transaction || transaction.status !== "PENDING") return;

    await tx.transaction.update({
      where: { id: args.transactionId },
      data: { status: "FAILED" },
    });

    await tx.order.update({
      where: { id: args.orderId },
      data: { status: "FAILED", paymentStatus: "FAILED" },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: args.orderId,
        status: "FAILED",
        occurredAt: new Date(),
        note: args.reason ?? null,
      },
    });
  });

  // Notify waiting SSE stream — must not throw if Redis is unavailable
  try {
    await getRedis().set(
      paymentChannel(args.orderId),
      JSON.stringify({ type: "payment_failed", orderId: args.orderId, reason: args.reason, timestamp: Date.now() }),
      { ex: 900 }
    );
  } catch (e) {
    console.error("[post-payment] Redis set failed (failed):", e);
  }
}
