/**
 * POST /api/admin/orders/instore/paystack/initialize
 *
 * Admin-created "in-store" order for a walk-in customer, paid via Paystack
 * inline card (Inline.js on the client — no redirect, so no callback_url is
 * passed here, unlike the customer checkout's hosted-page flow).
 *
 * Requires an authenticated admin session.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { resolvePromo, recordCouponRedemption } from "@/lib/promo";
import { initializeTransaction } from "@/lib/paystack/client";
import { isCardEligible } from "@/lib/payments/card-eligibility";
import { getRedis } from "@/lib/redis";
import { makeRatelimit } from "@/lib/ratelimit";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { buildInStoreOrderNumber } from "@/lib/orders/generate-instore-order-number";

const bodySchema = z
  .object({
    customerUserId: z.string().min(1).nullable().optional(),
    customerName: z.string().optional(),
    // Unlike the M-Pesa STK route, card payments don't push anything to a
    // phone — phone is optional here, matching inStoreOrder.customerPhone's
    // nullable schema column.
    customerPhone: z.string().min(9).optional(),
    customerEmail: z.string().email().optional(),
    items: z
      .array(z.object({ productId: z.string(), quantity: z.number().int().positive() }))
      .min(1),
    promoCode: z.string().optional(),
    branchId: z.string().min(1).optional(),
    // Present when the admin is retrying a payment attempt on an order whose
    // previous attempt already failed — reuses that order instead of
    // creating a new one.
    retryOrderId: z.string().optional(),
  })
  .strict();

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
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
  if (e instanceof z.ZodError) {
    console.error("[instore/paystack/initiate] validation failed:", e.issues);
  }
    return Err.validation("Invalid request body");
  }

  const { customerUserId, customerName, customerPhone, customerEmail, items, promoCode, branchId, retryOrderId } =
    parsed;

  try {
    // Retrying an order applies its own limiter (keyed per-order) instead of
    // the fresh-attempt one, so a burst of legitimate retries on one failing
    // order doesn't also chew through the 3/60s fresh-order budget.
    if (retryOrderId) {
      const retryLimiter = makeRatelimit(Ratelimit.slidingWindow(8, "60 s"), "instore_payment_retry");
      if (retryLimiter) {
        const { success } = await retryLimiter.limit(`${admin.id}:${retryOrderId}`);
        if (!success) return Err.rateLimited();
      }
    } else {
      const redis = getRedis();
      const rateKey = `instore_payment_attempt:${admin.id}:paystack`;
      const attempts = await redis.incr(rateKey);
      if (attempts === 1) await redis.expire(rateKey, 60);
      if (attempts > 3) return Err.rateLimited();
    }

    // Resolve branch — same precedence rule as the STK initiate route.
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

    // In-store card payments are walk-in (never international), so
    // eligibility is purely the branch's cardEligible flag.
    if (!isCardEligible(false, branch.cardEligible)) {
      return err("CARD_NOT_AVAILABLE", "Card payment is not available at this branch", 400);
    }

    // Never trust client-submitted prices — recompute from the DB.
    const products = await db.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
      select: { id: true, name: true, priceKes: true, isActive: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
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

    const normalizedPromoCode = promoCode?.trim().toUpperCase();
    let discountKes = 0;
    let resolvedPromoId: string | null = null;
    if (normalizedPromoCode) {
      try {
        const r = await resolvePromo(normalizedPromoCode, subtotalKes, customerUserId ?? undefined);
        discountKes = r.discountKes;
        resolvedPromoId = r.promo.id;
      } catch {
        /* invalid/expired — discount stays 0 */
      }
    }
    const totalKes = Math.max(0, subtotalKes - discountKes);

    let order;
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
      if (!isCardEligible(false, branch.cardEligible)) {
        return err("CARD_NOT_AVAILABLE", "Card payment is not available at this branch", 400);
      }

      order = await db.inStoreOrder.update({
        where: { id: retryOrderId },
        data: { paymentStatus: "PENDING" },
      });
    } else {
      const now = new Date();
      order = await db.inStoreOrder.create({
        data: {
          orderNumber: buildInStoreOrderNumber(now, branch.shortcode),
          branchId: branch.id,
          createdByAdminId: admin.id,
          createdByAdminName: admin.name,
          customerUserId: customerUserId ?? null,
          customerName: customerName ?? null,
          customerPhone,
          customerEmail: customerEmail ?? null,
          subtotalKes,
          discountKes,
          promoCode: normalizedPromoCode ?? null,
          totalKes,
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
      });

      // Only on the initial creation path — retries reuse the same order and
      // must not record a second redemption for one order.
      if (resolvedPromoId && normalizedPromoCode && customerUserId) {
        await recordCouponRedemption(resolvedPromoId, customerUserId, order.id);
      }
    }

    // Paystack only allows alphanumeric + -.= in a reference — same
    // constraint as the customer checkout's reference derivation. On retry,
    // inStoreTransaction.paystackReference is unique in the DB and the
    // previous failed attempt already holds the order-number-derived
    // reference, so a retry needs its own distinct suffix to avoid a unique
    // constraint violation on create.
    const baseReference = order.orderNumber!.replace(/^#/, "");
    const reference = retryOrderId ? `${baseReference}-R${Date.now().toString(36).toUpperCase()}` : baseReference;

    const transaction = await db.inStoreTransaction.create({
      data: {
        inStoreOrderId: order.id,
        provider: "PAYSTACK",
        amount: totalKes,
        status: "PENDING",
        paystackReference: reference,
      },
    });

    const paystackRes = await initializeTransaction({
      email: customerEmail || "walkin@fechiorganics.com",
      amount: totalKes,
      reference,
      subaccount: branch.paystackSubaccount ?? undefined,
      metadata: { inStoreOrderId: order.id, adminId: admin.id },
    });

    console.info(
      `[instore/paystack/initialize] transaction initialized — order=${order.orderNumber} tx=${transaction.id} reference=${reference}`,
    );

    return ok({
      inStoreOrderId: order.id,
      orderNumber: order.orderNumber,
      accessCode: paystackRes.data.access_code,
      publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "",
    });
  } catch (e) {
    console.error("[instore/paystack/initialize] POST error", e);
    return Err.internal();
  }
}
