/**
 * POST /api/payments/points/checkout
 *
 * Completes an order that loyalty points cover in full, with no payment
 * gateway involved. Only reachable when the cash remainder is exactly zero.
 *
 * Security — this endpoint hands over goods without taking money, so nothing
 * the browser sends is trusted:
 *
 *  - The cart, product prices, delivery fee and coupon are all re-read from
 *    the database; the client sends only a delivery address and a *request* to
 *    spend N points.
 *  - computeOrderTotals re-reads the customer's real balance and refuses to
 *    spend more than they hold.
 *  - The order is rejected unless the recomputed total is exactly 0. A
 *    partially-covered order cannot be pushed through here to skip paying the
 *    remainder.
 *  - The points debit goes through the append-only ledger, which refuses to
 *    overdraw even under a concurrent request, and it happens BEFORE the order
 *    is marked paid. If the debit fails the order is failed, not fulfilled.
 *
 * Everything after the debit reuses markPaymentSuccess, so this path gets the
 * same order number, stock decrement, cart clear, confirmation email, invoice,
 * points/badge award and Zoho Sales Receipt push as a card or M-Pesa order.
 */

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { reportError } from "@/lib/observability";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";
import { resolveBranchForCounty } from "@/lib/payments/branch-resolver";
import { deliveryDataSchema } from "@/lib/payments/delivery-schema";
import { computeOrderTotals } from "@/lib/checkout/compute-totals";
import { recordCouponRedemption } from "@/lib/promo";
import { holdRedeemedPoints } from "@/lib/points/redeem";
import { markPaymentSuccess, markPaymentFailed } from "@/lib/payments/post-payment";
import { buildTimestampOrderNumber } from "@/lib/orders/generate-order-number";
import { readUtmCookie } from "@/lib/attribution";
import { getRedis } from "@/lib/redis";

const bodySchema = z.object({ deliveryData: deliveryDataSchema }).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();
  const userId = session.user.id;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (bodyErr) {
    reportError(bodyErr, {
      route: "POST /api/payments/points/checkout",
      tags: { stage: "body_validation" },
    });
    return Err.validation("Invalid request body");
  }

  const { deliveryData } = parsed;

  try {
    const cart = await db.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, priceKes: true, isActive: true } },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) return err("CART_EMPTY", "Your cart is empty", 400);

    const activeItems = cart.items.filter((item) => item.product.isActive);
    if (activeItems.length === 0) return err("CART_EMPTY", "No active products in cart", 400);

    // Same throttle as the gateway routes — stops a double-tap creating two
    // orders while the first is still being written.
    const redis = getRedis();
    const rateKey = `payment_attempt:${userId}:points`;
    const attempts = await redis.incr(rateKey);
    if (attempts === 1) await redis.expire(rateKey, 60);
    if (attempts > 3) return Err.rateLimited();

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
      route: "POST /api/payments/points/checkout",
    });

    // The two guards that make this endpoint safe to expose.
    if (totals.pointsRedeemed <= 0) {
      return Err.validation("No points were applied to this order");
    }
    if (totals.totalCents !== 0) {
      return err(
        "BALANCE_REMAINING",
        "This order still has an amount to pay — choose a payment method.",
        400,
      );
    }

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
      if (resolved) branch = await db.branch.findUnique({ where: { id: resolved.id } });
    }

    const now = new Date();
    const utm = readUtmCookie(req);
    const order = await db.order.create({
      data: {
        userId,
        subtotalKes: subtotalCents,
        deliveryKes: totals.deliveryCents,
        discountKes: totals.discountCents,
        pointsRedeemed: totals.pointsRedeemed,
        pointsDiscountKes: totals.pointsDiscountCents,
        totalKes: 0,
        promoCode: totals.promoCode,
        paymentStatus: "PENDING",
        status: "PENDING",
        orderNumber: buildTimestampOrderNumber(now, "MPESA"),
        createdAt: now,
        deliveryType: deliveryData.deliveryType,
        deliveryPhone: deliveryData.phone,
        deliveryAddress: deliveryData.address ?? null,
        deliveryCity: deliveryData.city ?? deliveryData.state ?? null,
        deliveryCounty: deliveryData.county || deliveryData.country,
        deliveryZone: deliveryData.deliveryZone ?? pricing.label,
        deliveryPostalCode: deliveryData.postalCode ?? null,
        deliveryCountry: deliveryData.countryName ?? null,
        isInternational: deliveryData.country.toUpperCase() !== "KE",
        branchId: branch?.id ?? null,
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
    });

    if (totals.promoId && totals.promoCode) {
      await recordCouponRedemption(totals.promoId, userId, order.id);
    }

    // A zero-amount transaction so every downstream surface — the admin orders
    // table, reports, the Zoho payment mode — reads "Fechi Points" instead of
    // showing no payment method at all.
    const transaction = await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "POINTS",
        branchId: branch?.id ?? null,
        amount: 0,
        status: "PENDING",
      },
    });

    // Debit BEFORE fulfilling. The ledger refuses to overdraw, so if the
    // balance moved between the quote and now, this throws and the order is
    // failed rather than handed over for free.
    try {
      await holdRedeemedPoints({ userId, orderId: order.id, points: totals.pointsRedeemed });
    } catch (debitErr) {
      reportError(debitErr, {
        route: "POST /api/payments/points/checkout",
        tags: { stage: "points_debit" },
        extra: { orderId: order.id },
      });
      await markPaymentFailed({
        transactionId: transaction.id,
        orderId: order.id,
        reason: "Points debit failed",
      });
      return Err.validation("Your points balance changed — please try again.");
    }

    await markPaymentSuccess({
      transactionId: transaction.id,
      orderId: order.id,
      transactionData: { status: "SUCCESS" },
    });

    return ok({ orderId: order.id, paidWithPoints: totals.pointsRedeemed });
  } catch (e) {
    // computeOrderTotals throws a Response for a validation failure (an
    // over-redemption, say) — pass it straight through.
    if (e instanceof Response) return e;
    reportError(e, { route: "POST /api/payments/points/checkout" });
    console.error("[points/checkout]", e);
    return Err.internal();
  }
}
