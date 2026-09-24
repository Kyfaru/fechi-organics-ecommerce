/**
 * POST /api/admin/orders/instore/mpesa/initiate
 *
 * Admin-created "in-store" order for a walk-in customer, paid via M-Pesa STK
 * push. Deliberately separate from the customer checkout flow — writes to
 * inStoreOrder/inStoreOrderItem/inStoreTransaction, never to order/transaction.
 *
 * Requires an authenticated admin session.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { recordCouponRedemption } from "@/lib/promo";
import { computeOrderTotals } from "@/lib/checkout/compute-totals";
import { holdRedeemedPoints } from "@/lib/points/redeem";
import { getRedis } from "@/lib/redis";
import { paymentChannel } from "@/lib/payment-channel";
import { makeRatelimit } from "@/lib/ratelimit";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { assertGatewayEnv } from "@/lib/payments/gateway-env";
import { dispatchStk } from "@/lib/payments/dispatch-stk";
import { finalizeStkDispatch } from "@/lib/payments/finalize-stk-dispatch";
import { buildInStoreOrderNumber } from "@/lib/orders/generate-instore-order-number";
import { createWithRetryableOrderNumber } from "@/lib/orders/create-with-retry";
import { findOrCreateWalkInCustomer } from "@/lib/customers/find-or-create-walkin";
import { requirePermission } from "@/lib/require-permission";
import { logActivity } from "@/lib/admin-activity";
import { reportError } from "@/lib/observability";
import { logServerError } from "@/lib/observability-server";
import { publishQstashJSON } from "@/lib/qstash";

// Dispatch now happens off this request (see /api/admin/workers/dispatch-stk)
// — this used to be 60 to give a synchronous primary+fallback gateway
// round trip room to finish; no longer needed.
export const maxDuration = 15;

const bodySchema = z
  .object({
    customerUserId: z.string().min(1).nullable().optional(),
    customerName: z.string().optional(),
    customerPhone: z.string().min(9),
    customerEmail: z.string().email().optional(),
    items: z
      .array(z.object({ productId: z.string(), quantity: z.number().int().positive() }))
      .min(1),
    promoCode: z.string().optional(),
    // Loyalty points the customer wants to spend. Only meaningful when
    // customerUserId is set — a nameless walk-in has no balance.
    pointsRequested: z.number().int().nonnegative().optional(),
    branchId: z.string().min(1).optional(),
    // Present when the admin is retrying a payment attempt on an order whose
    // previous attempt already failed — reuses that order instead of
    // creating a new one.
    retryOrderId: z.string().optional(),
    deliveryZoneId: z.string().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Auth helper — duplicated per-file per this codebase's convention (see
// app/api/admin/orders/route.ts) rather than shared.
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  return user?.role === "admin" ? user : null;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    assertGatewayEnv();
  } catch (envErr) {
    reportError(envErr, { route: "POST /api/admin/orders/instore/mpesa/initiate", tags: { stage: "gateway_env" } });
    console.error("[instore/mpesa/initiate] gateway env check failed:", envErr);
    return Err.internal(envErr, "Payments are temporarily unavailable. Please try again shortly.");
  }

  const denied = await requirePermission(req, { orders: ["update_status"] });
  if (denied) return denied;

  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    console.log("Incoming Body:", raw);
    parsed = bodySchema.parse(raw);
  } catch (e) {
    reportError(e, {
      route: "POST /api/admin/orders/instore/mpesa/initiate",
      userId: admin.id,
      tags: { stage: "body_validation" },
    });
  if (e instanceof z.ZodError) {
    console.error("[instore/mpesa/initiate] validation failed:", e.issues);
  }
    return Err.validation("Invalid request body");
  }

  const { customerUserId, customerName, customerPhone, customerEmail, items, promoCode, pointsRequested, branchId, retryOrderId, deliveryZoneId } =
    parsed;

  try {
    // Retrying an order applies its own limiter (keyed per-order) instead of
    // the fresh-attempt one, so a burst of legitimate retries on one failing
    // order doesn't also chew through the 3/60s fresh-order budget.
    if (retryOrderId) {
      const retryLimiter = makeRatelimit(Ratelimit.slidingWindow(4, "30 s"), "instore_payment_retry");
      if (retryLimiter) {
        const { success } = await retryLimiter.limit(`${admin.id}:${retryOrderId}`);
        if (!success) return Err.rateLimited();
      }
    } else {
      const redis = getRedis();
      const rateKey = `instore_payment_attempt:${admin.id}:mpesa`;
      const attempts = await redis.incr(rateKey);
      if (attempts === 1) await redis.expire(rateKey, 30);
      if (attempts > 3) return Err.rateLimited();
    }

    // Resolve branch: super admins must specify one, branch-scoped admins
    // are locked to their own branch.
    let branch: Awaited<ReturnType<typeof db.branch.findUnique>> | null = null;
    if (admin.adminProfile?.isSuperAdmin) {
      if (!branchId) return Err.validation("branchId is required for super admins");
      branch = await db.branch.findUnique({ where: { id: branchId, isActive: true } });
      if (!branch) return err("NO_BRANCH", "Branch not found or inactive", 400);
    } else {
      if (!admin.adminProfile?.branchId) {
        return err("NO_BRANCH", "Admin has no assigned branch", 400);
      }
      branch = await db.branch.findUnique({
        where: { id: admin.adminProfile.branchId, isActive: true },
      });
      if (!branch) return err("NO_BRANCH", "Assigned branch not found or inactive", 400);
    }

    // Never trust client-submitted prices — recompute from the DB.
    const products: { id: string; name: string; priceKes: number; isActive: boolean }[] =
      await db.product.findMany({
        where: { id: { in: items.map((i) => i.productId) } },
        select: { id: true, name: true, priceKes: true, isActive: true },
      });
    const productById = new Map<string, { id: string; name: string; priceKes: number; isActive: boolean }>(
      products.map((p) => [p.id, p])
    );
    for (const item of items) {
      const product = productById.get(item.productId);
      if (!product || !product.isActive) {
        return err("PRODUCT_UNAVAILABLE", `Product ${item.productId} is unavailable`, 400);
      }
    }

    const subtotalKes = items.reduce((sum, item) => {
      const product = productById.get(item.productId)!;
      return sum + product.priceKes * item.quantity;
    }, 0);

    // Never trust a client-submitted delivery fee — resolve it from the real
    // DeliveryZone row, same "recompute from the DB" principle as product
    // prices above. An unknown/inactive zone id is treated as no delivery
    // (fail closed) rather than erroring the whole order.
    const deliveryZone = deliveryZoneId
      ? await db.deliveryZone.findUnique({ where: { id: deliveryZoneId, isActive: true } })
      : null;

    const {
      discountCents: discountKes,
      deliveryCents: deliveryKes,
      promoCode: normalizedPromoCode,
      promoId: resolvedPromoId,
      pointsRedeemed,
      pointsDiscountCents,
      totalCents: totalKes,
    } = await computeOrderTotals({
      subtotalCents: subtotalKes,
      deliveryCents: deliveryZone?.deliveryFeeKes ?? 0,
      promoCode,
      pointsRequested: customerUserId ? pointsRequested : 0,
      userId: customerUserId ?? null,
      // In-store keeps the delivery fee payable regardless of the coupon.
      discountAppliesToDelivery: false,
      route: "POST /api/admin/orders/instore/mpesa/initiate",
    });

    // Resolve the walk-in to a real customer record (find-by-phone or
    // create) so they appear on /admin/customers — skip on retry, the
    // original order already resolved this.
    let resolvedCustomerUserId = customerUserId ?? null;
    if (!retryOrderId && !resolvedCustomerUserId) {
      resolvedCustomerUserId = await findOrCreateWalkInCustomer({
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
      });
    }

    // 1. Create order + PENDING transaction atomically — or, on retry, reuse
    // the existing failed order instead of creating a new one.
    let order: Awaited<ReturnType<typeof db.inStoreOrder.create>>;
    if (retryOrderId) {
      const existingOrder = await db.inStoreOrder.findUnique({ where: { id: retryOrderId } });
      if (!existingOrder) return Err.notFound("Order");
      if (existingOrder.paymentStatus !== "FAILED") {
        return err("NOT_RETRYABLE", "Order is not in a failed state", 400);
      }

      // Dispatch against the order's own branch, never whatever the request
      // body's branchId says — the order was already assigned to a branch at
      // creation and that shouldn't silently change on retry.
      const orderBranch = await db.branch.findUnique({
        where: { id: existingOrder.branchId, isActive: true },
      });
      if (!orderBranch) return err("NO_BRANCH", "Order's branch not found or inactive", 400);
      branch = orderBranch;

      order = await db.inStoreOrder.update({
        where: { id: retryOrderId },
        data: { paymentStatus: "PENDING" },
      });

      // Found in review: this order id is reused on retry, but the previous
      // attempt's terminal event (markInStorePaymentFailed writes
      // instore_payment_failed unconditionally, TTL 900s) is still sitting
      // in Redis at this same channel key. Without clearing it, the new
      // PaymentWaitingModal's very first poll (within ~1s) would read that
      // stale failure, report it as the outcome of THIS attempt, and close
      // the stream before the real dispatch even runs — the admin would see
      // "Failed" regardless of whether the retry actually succeeds. Clearing
      // it here, once, before any new event can be written, avoids a race
      // with the dispatch worker (which only ever writes AFTER this request
      // returns).
      try {
        await getRedis().del(paymentChannel(order.id));
      } catch (e) {
        console.error("[instore/mpesa/initiate] Failed to clear stale payment channel on retry:", e);
      }
    } else {
      // Regenerates the order number and retries (once per second boundary)
      // if it collides on the orderNumber unique constraint, instead of
      // surfacing a raw DB error to the till (see lib/orders/create-with-retry.ts).
      order = await createWithRetryableOrderNumber(
        () => buildInStoreOrderNumber(new Date(), branch!.id),
        (orderNumber) =>
          db.inStoreOrder.create({
            data: {
              orderNumber,
              branchId: branch!.id,
              createdByAdminId: admin.id,
              createdByAdminName: admin.name,
              customerUserId: resolvedCustomerUserId,
              customerName: customerName ?? null,
              customerPhone,
              customerEmail: customerEmail ?? null,
              subtotalKes,
              discountKes,
              pointsRedeemed,
              pointsDiscountKes: pointsDiscountCents,
              promoCode: normalizedPromoCode ?? null,
              totalKes,
              deliveryKes,
              deliveryZoneId: deliveryZone?.id ?? null,
              deliveryLocation: deliveryZone?.name ?? null,
              deliveryCounty: deliveryZone?.county ?? null,
              paymentStatus: "PENDING",
              items: {
                create: items.map((item) => {
                  const product = productById.get(item.productId)!;
                  return {
                    productId: product.id,
                    name: product.name,
                    priceKes: product.priceKes,
                    quantity: item.quantity,
                  };
                }),
              },
            },
          }),
      );

      // Only on the initial creation path — retries reuse the same order and
      // must not record a second redemption for one order.
      if (resolvedPromoId && normalizedPromoCode && resolvedCustomerUserId) {
        await recordCouponRedemption(resolvedPromoId, resolvedCustomerUserId, order.id);
      }

      // Debit points now; markInStorePaymentFailed() hands them back if this
      // attempt never pays.
      if (customerUserId) {
        await holdRedeemedPoints({
          userId: customerUserId,
          orderId: order.id,
          points: pointsRedeemed,
          refType: "inStoreOrder",
        });
      }
    }

    const transaction = await db.inStoreTransaction.create({
      data: {
        inStoreOrderId: order.id,
        provider: "MPESA_STK",
        amount: totalKes,
        status: "PENDING",
      },
    });
    await db.inStoreTransactionEvent.create({
      data: { inStoreTransactionId: transaction.id, type: "INITIATED" },
    });

    // 2. Dispatch moves off this request entirely — publish a job for
    // /api/admin/workers/dispatch-stk to actually call the gateway. If
    // QStash itself isn't configured (dev/local), dispatch inline instead of
    // silently dropping the payment.
    const instoreCallbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}/api/payments/mpesa/instore-callback`;
    const instoreKcbCallbackUrl = `${process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL}/api/payments/mpesa/instore-callback`;
    const published = await publishQstashJSON(
      "/api/admin/workers/dispatch-stk",
      { kind: "instore", transactionId: transaction.id },
      { retries: 2 },
    );
    if (!published) {
      console.warn(`[instore/mpesa/initiate] QStash unavailable — dispatching inline for order=${order.orderNumber}`);
      const result = await dispatchStk({
        branch,
        phone: customerPhone,
        amountCents: totalKes,
        orderId: order.id,
        orderNumber: order.orderNumber,
        kind: "instore",
        kcbCallbackUrl: instoreKcbCallbackUrl,
        darajaCallbackUrl: instoreCallbackUrl,
      });
      await finalizeStkDispatch({ kind: "instore", transactionId: transaction.id, orderId: order.id, result });
      if (!result.success) {
        void logServerError(new Error(result.reason), { route: "POST /api/admin/orders/instore/mpesa/initiate", userId: admin.id, orderId: order.id });
        return err("STK_FAILED", "Could not initiate M-Pesa prompt. Please try again.", 502);
      }
    }

    console.info(
      `[instore/mpesa/initiate] responded in ${Date.now() - startedAt}ms — order=${order.orderNumber} dispatchQueued=${Boolean(published)}`,
    );

    if (!retryOrderId && admin.adminProfile) {
      logActivity(admin.adminProfile.id, `Created in-store order ${order.orderNumber}`, "order", order.id, req, {
        branchId: branch.id,
        itemCount: items.length,
        totalKes,
        paymentMethod: "MPESA_STK",
      });
    }

    return ok({ inStoreOrderId: order.id, orderNumber: order.orderNumber });
  } catch (e) {
    reportError(e, {
      route: "POST /api/admin/orders/instore/mpesa/initiate",
      userId: admin.id,
      tags: { stage: "handler" },
    });
    void logServerError(e, { route: "POST /api/admin/orders/instore/mpesa/initiate", userId: admin.id });
    console.error("[instore/mpesa/initiate] POST error", e);

    const prismaCode = (e as { code?: string })?.code;
    if (typeof prismaCode === "string" && prismaCode.startsWith("P")) {
      return err("DB_ERROR", `Database operation failed (${prismaCode})`, 500);
    }
    if (e instanceof Error && /daraja|stk-push|kcb/i.test(e.message)) {
      return err("MPESA_GATEWAY_ERROR", e.message, 502);
    }
    return Err.internal();
  }
}
