/**
 * POST /api/payments/kcb/initiate
 *
 * Creates an order from the authenticated user's cart and initiates a KCB
 * Buni M-Pesa STK push. On success the cart is cleared and the orderId is
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
import { initiateKcbStkPush } from "@/lib/payments/kcb/kcb-client";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";
import { resolvePromo } from "@/lib/promo";
import { getRedis } from "@/lib/redis";
import { markPaymentFailed } from "@/lib/payments/post-payment";

const deliveryDataSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(9),
  email: z.string().email().optional(),
  country: z.string().min(2).default("KE"),
  county: z.string().optional().default(""),
  state: z.string().optional(),
  zoneId: z.string().optional().nullable(),
  deliveryZone: z.string().optional().nullable(),
  deliveryKes: z.number().int().nonnegative().optional(),
  promoCode: z.string().optional().nullable(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]),
  branchId: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
});

const bodySchema = z.object({
  phone: z.string().min(9),
  deliveryData: deliveryDataSchema,
});

export async function POST(req: NextRequest) {
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

    const activeItems = cart.items.filter((item) => item.product.isActive);
    if (activeItems.length === 0) {
      return err("CART_EMPTY", "No active products in cart", 400);
    }

    const redis = getRedis();
    const rateKey = `payment_attempt:${userId}:kcb`;
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
    if (promoCode) {
      try {
        const r = await resolvePromo(promoCode, subtotalCents);
        discountCents = r.discountKes;
        if (r.deliveryFree) deliveryCents = 0;
      } catch {
        /* invalid/expired — discount stays 0 */
      }
    }
    const totalCents = Math.max(0, subtotalCents + deliveryCents - discountCents);

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

    // 7. Create transaction record (PENDING until callback arrives)
    const transaction = await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "KCB",
        branchId: branch.id,
        amount: totalCents,
        status: "PENDING",
      },
    });

    // 8. Initiate KCB Buni STK push
    const callbackUrl = `${process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL}/api/payments/kcb/callback`;

    const kcbRes = await initiateKcbStkPush({
      branch: {
        id: branch.id,
        shortcode: branch.shortcode,
        invoiceNumber: branch.invoiceNumber ?? null,
        consumerKeyEnc: branch.consumerKeyEnc,
        consumerSecretEnc: branch.consumerSecretEnc,
        apiKeyEnc: branch.apiKeyEnc ?? null,
      },
      phone,
      amountKes: totalCents, // function converts to whole KES internally
      orderId: order.id,
      callbackUrl,
    });

    // 9. Persist CheckoutRequestID so the callback can look up the transaction
    if (!kcbRes.CheckoutRequestID) {
      // KCB returned an unexpected response shape — fail fast so the SSE modal updates
      await markPaymentFailed({
        transactionId: transaction.id,
        orderId: order.id,
        reason: "STK push did not return a CheckoutRequestID",
      });
      console.error("[kcb/initiate] Missing CheckoutRequestID — order:", order.id);
      return err("STK_FAILED", "Could not initiate M-Pesa prompt. Please try again.", 502);
    }

    await db.transaction.update({
      where: { id: transaction.id },
      data: { checkoutRequestId: kcbRes.CheckoutRequestID },
    });

    console.info(
      `[kcb/initiate] STK push initiated — order=${order.id} checkout=${kcbRes.CheckoutRequestID}`,
    );

    return ok({ orderId: order.id, message: "Check your phone for the M-Pesa prompt" });
  } catch (e) {
    console.error("[kcb/initiate] POST error", e);
    return Err.internal();
  }
}
