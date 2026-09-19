/**
 * POST /api/payments/mpesa/initiate
 *
 * Creates an order from the caller's cart and initiates an M-Pesa STK push to
 * their phone. On success the cart is cleared and the orderId is returned so
 * the checkout page can poll /api/payments/status/[orderId].
 *
 * Works for both a signed-in customer and a guest checkout (no session) —
 * see lib/customers/find-or-create-guest.ts for how a guest's typed-in
 * name/email/phone is resolved to the `userId` the order is created under.
 */

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { reportError } from "@/lib/observability";
import { resolveCart } from "@/lib/cart";
import { resolveCheckoutUserId } from "@/lib/customers/find-or-create-guest";
import { checkGuestCheckoutAbuse } from "@/lib/payments/guest-abuse-guard";
import { resolveBranchForCounty } from "@/lib/payments/branch-resolver";
import { assertGatewayEnv } from "@/lib/payments/gateway-env";
import { dispatchStk } from "@/lib/payments/dispatch-stk";
import { finalizeStkDispatch } from "@/lib/payments/finalize-stk-dispatch";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";
import { recordCouponRedemption } from "@/lib/promo";
import { computeOrderTotals } from "@/lib/checkout/compute-totals";
import { holdRedeemedPoints } from "@/lib/points/redeem";
import { getRedis } from "@/lib/redis";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { publishQstashJSON } from "@/lib/qstash";
import { deliveryDataSchema } from "@/lib/payments/delivery-schema";
import { buildTimestampOrderNumber } from "@/lib/orders/generate-order-number";
import { createWithRetryableOrderNumber } from "@/lib/orders/create-with-retry";
import { readUtmCookie } from "@/lib/attribution";

export const maxDuration = 15;

const bodySchema = z.object({
  phone: z.string().min(9),
  deliveryData: deliveryDataSchema,
}).strict();

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    assertGatewayEnv();
  } catch (envErr) {
    reportError(envErr, { route: "POST /api/payments/mpesa/initiate", tags: { stage: "gateway_env" } });
    console.error("[mpesa/initiate] gateway env check failed:", envErr);
    return Err.internal(envErr, "Payments are temporarily unavailable. Please try again shortly.");
  }

  // 1. A session is optional — guest checkout is allowed (see the identity
  // resolution below, once the cart is confirmed non-empty).
  const session = await auth.api.getSession({ headers: await headers() });

  // 2. Parse and validate body
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    parsed = bodySchema.parse(raw);
  } catch (bodyErr) {
    reportError(bodyErr, { route: "POST /api/payments/mpesa/initiate", tags: { stage: "body_validation" } });
    return Err.validation("Invalid request body");
  }

  const { phone, deliveryData } = parsed;

  try {
    // 3. Load cart and validate it is not empty. A guest's cart lives under
    // the fechi_cart cookie token, not a userId — resolveCart() branches on
    // that the same way GET /api/cart already does.
    const { cartId } = await resolveCart(session?.user?.id ?? null);
    const cart = await db.cart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, priceKes: true, isActive: true, stock: true },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return err("CART_EMPTY", "Your cart is empty", 400);
    }

    // Filter out items where the product is no longer active
    const activeItems = cart.items.filter((item) => item.product.isActive);
    if (activeItems.length === 0) {
      return err("CART_EMPTY", "No active products in cart", 400);
    }

    // 4. Guest-specific abuse guard, keyed on IP + the phone this STK push
    // targets — must run BEFORE resolveCheckoutUserId, since that mints a
    // fresh userId per unseen email and would otherwise make the per-userId
    // limiter below useless against a guest rotating emails (see
    // lib/payments/guest-abuse-guard.ts).
    if (!session?.user) {
      const abuseCheck = await checkGuestCheckoutAbuse(req, phone);
      if (abuseCheck) return abuseCheck;
    }

    // 5. Resolve who this order belongs to — the session, or a guest row
    // found/created from the delivery form's contact details.
    const identity = await resolveCheckoutUserId(session, {
      fullName: deliveryData.fullName,
      email: deliveryData.email,
      phone: deliveryData.phone,
    }, req.cookies.get("fechi_device")?.value);
    if ("error" in identity) return identity.error;
    const userId = identity.userId;

    const redis = getRedis();
    const rateKey = `payment_attempt:${userId}:mpesa`;
    const attempts = await redis.incr(rateKey);
    if (attempts === 1) await redis.expire(rateKey, 60);
    if (attempts > 3) return Err.rateLimited();

    // 5. Calculate totals (coupon + loyalty points) — see lib/checkout/compute-totals.ts
    const subtotalCents = activeItems.reduce(
      (sum, item) => sum + item.product.priceKes * item.quantity,
      0,
    );
    const pricing = await calculateDeliveryPricing({
      country: deliveryData.country,
      county: deliveryData.county,
      zoneId: deliveryData.zoneId,
      deliveryType: deliveryData.deliveryType,
    });
    const totals = await computeOrderTotals({
      subtotalCents,
      deliveryCents: pricing.feeKes,
      promoCode: deliveryData.promoCode,
      pointsRequested: deliveryData.pointsRequested,
      userId,
      phone,
      route: "POST /api/payments/mpesa/initiate",
    });
    const {
      deliveryCents,
      discountCents,
      promoCode,
      promoId: resolvedPromoId,
      pointsRedeemed,
      pointsDiscountCents,
      totalCents,
    } = totals;

    // 6. Resolve branch — use provided branchId or look up by county
    let branch: Awaited<ReturnType<typeof db.branch.findUnique>> | null = null;

    if (deliveryData.branchId) {
      branch = await db.branch.findUnique({
        where: { id: deliveryData.branchId, isActive: true },
      });
    }

    if (!branch) {
      const resolved = await resolveBranchForCounty(deliveryData.county || "Nairobi", {
        zoneId: deliveryData.zoneId,
      });
      if (resolved) {
        branch = await db.branch.findUnique({ where: { id: resolved.id } });
      }
    }

    if (!branch) {
      return err("NO_BRANCH", "No active M-Pesa branch available", 503);
    }

    // 7. Create order — regenerates the order number and retries (once per
    // second boundary) if it collides on the orderNumber unique constraint,
    // instead of surfacing a raw DB error (see lib/orders/create-with-retry.ts).
    const utm = readUtmCookie(req);
    const order = await createWithRetryableOrderNumber(
      () => buildTimestampOrderNumber(new Date(), "MPESA"),
      (orderNumber) =>
        db.order.create({
          data: {
            userId,
            subtotalKes: subtotalCents,
            deliveryKes: deliveryCents,
            discountKes: discountCents,
            pointsRedeemed,
            pointsDiscountKes: pointsDiscountCents,
            totalKes: totalCents,
            promoCode: promoCode ?? null,
            pendingReferralCode: deliveryData.referralCode?.trim().toUpperCase() || null,
            paymentStatus: "PENDING",
            status: "PENDING",
            orderNumber,
            deliveryType: deliveryData.deliveryType,
            deliveryPhone: deliveryData.phone,
            deliveryAddress: deliveryData.address ?? null,
            deliveryCity: deliveryData.city ?? deliveryData.state ?? null,
            deliveryCounty: deliveryData.county || deliveryData.country,
            deliveryZone: deliveryData.deliveryZone ?? pricing.label,
            deliveryPostalCode: deliveryData.postalCode ?? null,
            deliveryCountry: deliveryData.countryName ?? null,
            deliveryNote: deliveryData.notes ?? null,
            isInternational: deliveryData.country.toUpperCase() !== "KE",
            branchId: branch.id,
            utmSource: utm?.source ?? null,
            utmMedium: utm?.medium ?? null,
            utmCampaign: utm?.campaign ?? null,
            items: {
              create: activeItems.map((item) => ({
                productId: item.product.id,
                name: item.product.name,
                priceKes: item.product.priceKes,
                quantity: item.quantity,
                variantId: item.variantId,
                variantLabel: item.variantLabel,
              })),
            },
          },
        }),
    );

    // Record coupon redemption
    if (resolvedPromoId && promoCode) {
      await recordCouponRedemption(resolvedPromoId, userId, order.id);
    }

    // Debit points now so the same balance can't be spent in a parallel
    // checkout. markPaymentFailed() gives them back if this never pays.
    await holdRedeemedPoints({ userId, orderId: order.id, points: pointsRedeemed });

    // 8. Create transaction record (PENDING until callback arrives)
    const transaction = await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "MPESA",
        branchId: branch.id,
        amount: totalCents,
        status: "PENDING",
      },
    });
    await db.transactionEvent.create({
      data: { transactionId: transaction.id, type: "INITIATED" },
    });

    // 9. Dispatch moves off this request entirely — publish a job for
    // /api/admin/workers/dispatch-stk to actually call the gateway, so this
    // route can respond before the (up to ~50s worst-case, primary+fallback)
    // gateway round trip even starts. If QStash itself isn't configured
    // (publishQstashJSON returns null — dev/local), dispatch inline instead
    // of silently dropping the payment; that's the one path where the
    // sub-second response isn't guaranteed.
    const published = await publishQstashJSON(
      "/api/admin/workers/dispatch-stk",
      { kind: "online", transactionId: transaction.id },
      { retries: 2 },
    );
    if (!published) {
      console.warn(`[mpesa/initiate] QStash unavailable — dispatching inline for order=${order.orderNumber}`);
      const result = await dispatchStk({
        branch,
        phone,
        amountCents: totalCents,
        orderId: order.id,
        orderNumber: order.orderNumber,
        kind: "online",
        kcbCallbackUrl: `${process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL}/api/payments/kcb/callback`,
        darajaCallbackUrl: `${process.env.MPESA_CALLBACK_BASE_URL}/api/payments/mpesa/callback`,
      });
      await finalizeStkDispatch({ kind: "online", transactionId: transaction.id, orderId: order.id, result });
      if (!result.success) {
        return err("STK_FAILED", "Could not initiate M-Pesa prompt. Please try again.", 502);
      }
    }

    console.info(
      `[mpesa/initiate] responded in ${Date.now() - startedAt}ms — order=${order.orderNumber} dispatchQueued=${Boolean(published)}`,
    );

    return ok({ orderId: order.id });
  } catch (e) {
    reportError(e, { route: "POST /api/payments/mpesa/initiate", tags: { stage: "handler" } });
    console.error("[mpesa/initiate] POST error", e);
    return Err.internal();
  }
}
