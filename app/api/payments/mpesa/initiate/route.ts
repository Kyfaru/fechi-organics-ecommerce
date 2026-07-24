/**
 * POST /api/payments/mpesa/initiate
 *
 * Creates an order from the authenticated user's cart and initiates an M-Pesa
 * STK push to their phone. On success the cart is cleared and the orderId is
 * returned so the payment page can poll /api/payments/status/[orderId].
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
import { getDarajaToken } from "@/lib/payments/mpesa/daraja-client";
import { initiateSTKPush } from "@/lib/payments/mpesa/stk-push";
import { resolveMpesaGateway, otherGateway } from "@/lib/payments/mpesa/gateway";
import type { MpesaGateway } from "@prisma/client";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";
import { resolvePromo, recordCouponRedemption } from "@/lib/promo";
import { getRedis } from "@/lib/redis";
import { markPaymentFailed } from "@/lib/payments/post-payment";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { publishQstashJSON } from "@/lib/qstash";
import { deliveryDataSchema } from "@/lib/payments/delivery-schema";
import { buildTimestampOrderNumber } from "@/lib/orders/generate-order-number";

const PAYMENT_TIMEOUT_SECONDS = 5 * 60; // abandon unpaid orders 5 minutes after STK push / checkout init

const bodySchema = z.object({
  phone: z.string().min(9),
  deliveryData: deliveryDataSchema,
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  // 1. Authenticate
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const userId = session.user.id;

  // 2. Parse and validate body
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    parsed = bodySchema.parse(raw);
  } catch {
    return Err.validation("Invalid request body");
  }

  const { phone, deliveryData } = parsed;

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

    // Filter out items where the product is no longer active
    const activeItems = cart.items.filter((item) => item.product.isActive);
    if (activeItems.length === 0) {
      return err("CART_EMPTY", "No active products in cart", 400);
    }

    const redis = getRedis();
    const rateKey = `payment_attempt:${userId}:mpesa`;
    const attempts = await redis.incr(rateKey);
    if (attempts === 1) await redis.expire(rateKey, 60);
    if (attempts > 3) return Err.rateLimited();

    // 4. Calculate totals
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
        const r = await resolvePromo(promoCode, subtotalCents, userId);
        discountCents = r.discountKes;
        if (r.deliveryFree) deliveryCents = 0;
        resolvedPromoId = r.promo.id;
      } catch {
        /* invalid/expired — discount stays 0 */
      }
    }
    const totalCents = Math.max(0, subtotalCents + deliveryCents - discountCents);
    const totalKes = totalCents / 100; // Convert cents to whole KES for Daraja

    // 5. Resolve branch — use provided branchId or look up by county
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

    // 6. Create order
    const now = new Date();
    const orderNumber = buildTimestampOrderNumber(now, "MPESA");
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
        orderNumber,
        createdAt: now,
        deliveryType: deliveryData.deliveryType,
        deliveryPhone: deliveryData.phone,
        deliveryAddress: deliveryData.address ?? null,
        deliveryCity: deliveryData.city ?? deliveryData.state ?? null,
        deliveryCounty: deliveryData.county || deliveryData.country,
        deliveryZone: deliveryData.deliveryZone ?? pricing.label,
        isInternational: deliveryData.country.toUpperCase() !== "KE",
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
      await recordCouponRedemption(resolvedPromoId, userId, order.id);
    }

    // 7. Create transaction record (PENDING until callback arrives)
    const transaction = await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "MPESA",
        branchId: branch.id,
        amount: totalCents,
        status: "PENDING",
      },
    });

    // 8. Dispatch by gateway — forced to KCB Buni until DARAJA_ENABLED=true
    // (see lib/payments/mpesa/gateway.ts). Falls back to the other gateway
    // once if the primary attempt throws.
    async function dispatchKcb(): Promise<string> {
      const { initiateKcbStkPush } = await import("@/lib/payments/kcb/kcb-client");
      if (!branch!.invoiceNumber) {
        throw new Error(`Branch ${branch!.id} has no invoiceNumber configured for KCB Buni`);
      }
      const formatOrderNumber = order.orderNumber?.slice(4, -1);
      const invoiceCode = `${branch!.invoiceNumber}-${formatOrderNumber}`;
      const kcbRes = await initiateKcbStkPush({
        branch: {
          id: branch!.id,
          shortcode: branch!.shortcode,
          invoiceNumber: invoiceCode ?? branch!.invoiceNumber,
          consumerKeyEnc: branch!.consumerKeyEnc,
          consumerSecretEnc: branch!.consumerSecretEnc,
          apiKeyEnc: branch!.apiKeyEnc ?? null,
        },
        phone,
        amountKes: totalCents,
        orderId: order.id,
        callbackUrl: `${process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL}/api/payments/kcb/callback`,
      });
      if (!kcbRes.CheckoutRequestID) {
        throw new Error("KCB STK push did not return a CheckoutRequestID");
      }
      return kcbRes.CheckoutRequestID;
    }

    async function dispatchDaraja(): Promise<string> {
      await getDarajaToken(branch!); // warm-up / validate credentials early
      const callbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}/api/payments/mpesa/callback`;
      const stkResponse = await initiateSTKPush({
        branch: branch!,
        phone,
        amountKes: totalKes,
        orderId: order.orderNumber ?? order.id,
        callbackUrl,
      });
      return stkResponse.CheckoutRequestID;
    }

    async function dispatch(gateway: MpesaGateway): Promise<string> {
      return gateway === "KCB_BUNI" ? dispatchKcb() : dispatchDaraja();
    }

    const primaryGateway = resolveMpesaGateway(branch);
    const fallbackGateway = otherGateway(primaryGateway);
    let checkoutRequestId: string;
    let gatewayUsed: MpesaGateway = primaryGateway;
    try {
      checkoutRequestId = await dispatch(primaryGateway);
    } catch (primaryErr) {
      console.error(`[mpesa/initiate] ${primaryGateway} dispatch failed, falling back to ${fallbackGateway}`, primaryErr);
      try {
        checkoutRequestId = await dispatch(fallbackGateway);
        gatewayUsed = fallbackGateway;
      } catch (fallbackErr) {
        console.error(`[mpesa/initiate] ${fallbackGateway} fallback also failed`, fallbackErr);
        await markPaymentFailed({
          transactionId: transaction.id,
          orderId: order.id,
          reason: "Both M-Pesa gateways failed to initiate",
        });
        return err("STK_FAILED", "Could not initiate M-Pesa prompt. Please try again.", 502);
      }
    }

    // 9. Persist CheckoutRequestID + which gateway actually handled this, so
    // the callback can look up the transaction and Finance can see the route.
    await db.transaction.update({
      where: { id: transaction.id },
      data: { checkoutRequestId, mpesaGatewayUsed: gatewayUsed },
    });

    // Schedule a timeout: if the customer abandons the STK prompt and no
    // callback arrives within 5 minutes, flip the order to FAILED.
    await publishQstashJSON(
      "/api/admin/workers/check-failed-payment",
      { orderId: order.id, transactionId: transaction.id },
      { delay: PAYMENT_TIMEOUT_SECONDS },
    );

    console.info(
      `[mpesa/initiate] STK push initiated — order=${order.orderNumber} checkout=${checkoutRequestId}`,
    );

    return ok({ orderId: order.id });
  } catch (e) {
    console.error("[mpesa/initiate] POST error", e);
    return Err.internal(e);
  }
}
