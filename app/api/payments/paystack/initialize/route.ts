/**
 * POST /api/payments/paystack/initialize
 *
 * Creates an order from the authenticated user's cart and initializes a
 * Paystack card transaction. Returns the authorization URL so the client can
 * redirect the customer to Paystack's hosted checkout.
 *
 * Requires an active session. Guests cannot use this endpoint.
 */

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { resolveBranchForCounty } from "@/lib/payments/branch-resolver";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";
import { resolvePromo } from "@/lib/promo";
import { initializeTransaction } from "@/lib/paystack/client";
import { buildTimestampOrderNumber } from "@/lib/orders/generate-order-number";
import { getRedis } from "@/lib/redis";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { publishQstashJSON } from "@/lib/qstash";
import { deliveryDataSchema } from "@/lib/payments/delivery-schema";

const PAYMENT_TIMEOUT_SECONDS = 5 * 60; // abandon unpaid orders 5 minutes after STK push / checkout init

const bodySchema = z.object({
  deliveryData: deliveryDataSchema,
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  // 1. Authenticate
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const userId = session.user.id;
  const userEmail = session.user.email;

  // 2. Parse and validate body
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    parsed = bodySchema.parse(raw);
  } catch {
    return Err.validation("Invalid request body");
  }

  const { deliveryData } = parsed;

  try {
    // 3. Load cart and validate it is not empty
    const cart = await db.cart.findUnique({
      where: { userId },
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

    const redis = getRedis();
    const rateKey = `payment_attempt:${userId}:paystack`;
    const attempts = await redis.incr(rateKey);
    if (attempts === 1) await redis.expire(rateKey, 60);
    if (attempts > 3) return Err.rateLimited();

    // 4. Calculate totals — never trust client amounts
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
    const promoCode = deliveryData.promoCode?.trim().toUpperCase();
    let discountCents = 0;
    let deliveryCents = pricing.feeKes;
    let resolvedPromoId: string | null = null;
    if (promoCode) {
      try {
        const r = await resolvePromo(promoCode, subtotalCents);
        discountCents = r.discountKes;
        if (r.deliveryFree) deliveryCents = 0;
        resolvedPromoId = r.promo.id;
      } catch {
        /* invalid/expired — discount stays 0 */
      }
    }
    const totalCents = Math.max(0, subtotalCents + deliveryCents - discountCents);

    // 5. Resolve branch — international orders route to the main branch
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

    if (!branch.paystackSubaccount) {
      return Err.internal("Branch not configured for card payments");
    }

    // 6. Create order
    const now = new Date();
    const order = await db.order.create({
      data: {
        userId,
        subtotalKes: subtotalCents,
        deliveryKes: deliveryCents,
        discountKes: discountCents,
        totalKes: totalCents,
        promoCode: promoCode ?? null,
        paymentStatus: "PENDING",
        status: "PENDING",
        orderNumber: buildTimestampOrderNumber(now, "PAYSTACK"),
        createdAt: now,
        deliveryType: deliveryData.deliveryType,
        deliveryPhone: deliveryData.phone,
        deliveryAddress: deliveryData.address ?? null,
        deliveryCity: deliveryData.city ?? deliveryData.state ?? null,
        deliveryCounty: deliveryData.county || deliveryData.country,
        deliveryZone: deliveryData.deliveryZone ?? pricing.label,
        isInternational,
        branchId: branch.id,
        items: {
          create: activeItems.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            priceKes: item.product.priceKes,
            quantity: item.quantity,
          })),
        },
      },
    });

    // Record coupon redemption
    if (resolvedPromoId && promoCode) {
      await db.couponRedemption.upsert({
        where: { couponId_userId: { couponId: resolvedPromoId, userId } },
        create: { couponId: resolvedPromoId, userId, orderId: order.id },
        update: {},
      });
      await db.promotion.update({
        where: { id: resolvedPromoId },
        data: { usedCount: { increment: 1 } },
      });
    }

    // 7. Generate reference and create transaction record (PENDING)
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

    // 8. Initialize Paystack transaction
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.MPESA_CALLBACK_BASE_URL ?? "";
    const paystackRes = await initializeTransaction({
      email: userEmail,
      amount: totalCents,
      reference,
      subaccount: branch.paystackSubaccount,
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
    console.error("[paystack/initialize] POST error", e);
    return Err.internal();
  }
}
