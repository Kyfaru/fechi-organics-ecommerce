/**
 * POST /api/payments/paystack/initialize
 *
 * Creates an order from the caller's cart and initializes a Paystack card
 * transaction. Returns the authorization URL so the client can redirect the
 * customer to Paystack's hosted checkout.
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
import { isCardEligible } from "@/lib/payments/card-eligibility";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";
import { recordCouponRedemption } from "@/lib/promo";
import { computeOrderTotals } from "@/lib/checkout/compute-totals";
import { holdRedeemedPoints } from "@/lib/points/redeem";
import { initializeTransaction } from "@/lib/paystack/client";
import { buildTimestampOrderNumber } from "@/lib/orders/generate-order-number";
import { createWithRetryableOrderNumber } from "@/lib/orders/create-with-retry";
import { getRedis } from "@/lib/redis";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { publishQstashJSON } from "@/lib/qstash";
import { deliveryDataSchema } from "@/lib/payments/delivery-schema";
import { readUtmCookie } from "@/lib/attribution";

const PAYMENT_TIMEOUT_SECONDS = 5 * 60; // abandon unpaid orders 5 minutes after STK push / checkout init

const bodySchema = z.object({
  deliveryData: deliveryDataSchema,
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  // 1. A session is optional — guest checkout is allowed (see the identity
  // resolution below, once the cart is confirmed non-empty).
  const session = await auth.api.getSession({ headers: await headers() });

  // 2. Parse and validate body
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    parsed = bodySchema.parse(raw);
  } catch (bodyErr) {
    reportError(bodyErr, { route: "POST /api/payments/paystack/initialize", tags: { stage: "body_validation" } });
    return Err.validation("Invalid request body");
  }

  const { deliveryData } = parsed;

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

    const activeItems = cart.items.filter((item) => item.product.isActive);
    if (activeItems.length === 0) {
      return err("CART_EMPTY", "No active products in cart", 400);
    }

    // 4. Guest-specific abuse guard — must run BEFORE resolveCheckoutUserId,
    // since that mints a fresh userId per unseen email and would otherwise
    // make the per-userId limiter below useless against a guest rotating
    // emails (see lib/payments/guest-abuse-guard.ts).
    if (!session?.user) {
      const abuseCheck = await checkGuestCheckoutAbuse(req, deliveryData.phone);
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
    // Paystack needs an email either way — session users always have one;
    // guest checkout requires deliveryData.email (enforced above).
    const userEmail = session?.user?.email ?? deliveryData.email!;

    const redis = getRedis();
    const rateKey = `payment_attempt:${userId}:paystack`;
    const attempts = await redis.incr(rateKey);
    if (attempts === 1) await redis.expire(rateKey, 60);
    if (attempts > 3) return Err.rateLimited();

    // 5. Calculate totals — never trust client amounts
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
    const {
      deliveryCents,
      discountCents,
      promoCode,
      promoId: resolvedPromoId,
      pointsRedeemed,
      pointsDiscountCents,
      totalCents,
    } = await computeOrderTotals({
      subtotalCents,
      deliveryCents: pricing.feeKes,
      promoCode: deliveryData.promoCode,
      pointsRequested: deliveryData.pointsRequested,
      userId,
      phone: deliveryData.phone,
      route: "POST /api/payments/paystack/initialize",
    });

    // 6. Resolve branch — international orders route to the main branch
    let branch: Awaited<ReturnType<typeof db.branch.findUnique>> | null = null;
    const isInternational = deliveryData.country.toUpperCase() !== "KE";

    if (deliveryData.branchId) {
      branch = await db.branch.findUnique({
        where: { id: deliveryData.branchId, isActive: true },
      });
    }

    if (!branch && isInternational) {
      branch = await db.branch.findFirst({ where: { isMain: true, isActive: true } });
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
      return err("NO_BRANCH", "No active branch available", 503);
    }

    if (!isCardEligible(isInternational, branch.cardEligible)) {
      return err(
        "CARD_NOT_AVAILABLE",
        "Card payment is not available for this delivery location. Please use M-Pesa.",
        400,
      );
    }

    // 7. Create order — regenerates the order number and retries (once per
    // second boundary) if it collides on the orderNumber unique constraint,
    // instead of surfacing a raw DB error (see lib/orders/create-with-retry.ts).
    const utm = readUtmCookie(req);
    const order = await createWithRetryableOrderNumber(
      () => buildTimestampOrderNumber(new Date(), "PAYSTACK"),
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
            isInternational,
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

    // 8. Generate reference and create transaction record (PENDING)
    // Paystack only allows alphanumeric + -.= in a reference, and a literal
    // "#" would also truncate the callback_url query string at a URL fragment.
    const reference = order.orderNumber!.replace(/^#/, "");

    const transaction = await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "PAYSTACK",
        branchId: branch.id,
        amount: totalCents,
        status: "PENDING",
        paystackReference: reference,
      },
    });

    // 9. Initialize Paystack transaction
    // Derived from the incoming request's own origin rather than
    // NEXT_PUBLIC_APP_URL — that's inlined at build time, so a production
    // image built without it passed through as a Docker build arg silently
    // ships whatever it defaulted to (e.g. "http://localhost:3000"), sending
    // customers back to a URL that only resolves on a developer's machine.
    // req.nextUrl.origin reflects whatever domain the customer's browser is
    // actually on right now — the same source verify/route.ts's redirects
    // already rely on downstream.
    const baseUrl = req.nextUrl.origin;
    const paystackRes = await initializeTransaction({
      email: userEmail,
      amount: totalCents,
      reference,
      callback_url: `${baseUrl}/api/payments/paystack/verify?reference=${reference}`,
      metadata: { orderId: order.id, userId },
    });

    // Schedule a timeout: if the customer abandons the hosted checkout and no
    // webhook/verify call arrives within 5 minutes, flip the order to FAILED.
    // Placed after initializeTransaction succeeds so we don't schedule a
    // timeout for a transaction that never got a live Paystack session.
    await publishQstashJSON(
      "/api/admin/workers/check-failed-payment",
      { orderId: order.id, transactionId: transaction.id },
      { delay: PAYMENT_TIMEOUT_SECONDS },
    );

    console.info(
      `[paystack/initialize] transaction initialized — order=${order.id} reference=${reference}`,
    );

    return ok({
      authorization_url: paystackRes.data.authorization_url,
      reference,
      orderId: order.id,
    });
  } catch (e) {
    reportError(e, { route: "POST /api/payments/paystack/initialize", tags: { stage: "handler" } });
    console.error("[paystack/initialize] POST error", e);
    return Err.internal();
  }
}
