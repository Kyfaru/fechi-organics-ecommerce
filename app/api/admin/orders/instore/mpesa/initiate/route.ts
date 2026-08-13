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
import { getDarajaToken } from "@/lib/payments/mpesa/daraja-client";
import { initiateSTKPush } from "@/lib/payments/mpesa/stk-push";
import { resolvePromo, recordCouponRedemption } from "@/lib/promo";
import { getRedis } from "@/lib/redis";
import { makeRatelimit } from "@/lib/ratelimit";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { markInStorePaymentFailed } from "@/lib/payments/instore-post-payment";
import { resolveMpesaGateway, otherGateway } from "@/lib/payments/mpesa/gateway";
import type { MpesaGateway } from "@prisma/client";
import { buildInStoreOrderNumber } from "@/lib/orders/generate-instore-order-number";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import { publishQstashJSON } from "@/lib/qstash";

// Gives the client's 60s AbortSignal.timeout room to fire before the
// serverless function itself gets cut off mid-dispatch.
export const maxDuration = 60;

const PAYMENT_TIMEOUT_SECONDS = 15 * 60; // abandon unpaid in-store orders 15 minutes after STK push

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
    branchId: z.string().min(1).optional(),
    // Present when the admin is retrying a payment attempt on an order whose
    // previous attempt already failed — reuses that order instead of
    // creating a new one.
    retryOrderId: z.string().optional(),
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
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

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

  const { customerUserId, customerName, customerPhone, customerEmail, items, promoCode, branchId, retryOrderId } =
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

    const normalizedPromoCode = promoCode?.trim().toUpperCase();
    let discountKes = 0;
    let resolvedPromoId: string | null = null;
    if (normalizedPromoCode) {
      try {
        const r = await resolvePromo(normalizedPromoCode, subtotalKes, customerUserId ?? undefined);
        discountKes = r.discountKes;
        resolvedPromoId = r.promo.id;
      } catch (promoErr) {
        reportError(promoErr, {
          route: "POST /api/admin/orders/instore/mpesa/initiate",
          userId: admin.id,
          tags: { stage: "promo_resolution" },
        });
        /* invalid/expired — discount stays 0 */
      }
    }
    const totalKes = Math.max(0, subtotalKes - discountKes);

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
    } else {
      const now = new Date();
      const orderNumber = buildInStoreOrderNumber(now, branch.shortcode);
      order = await db.inStoreOrder.create({
        data: {
          orderNumber,
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

    const transaction = await db.inStoreTransaction.create({
      data: {
        inStoreOrderId: order.id,
        provider: "MPESA_STK",
        amount: totalKes,
        status: "PENDING",
      },
    });

    // 2. Dispatch STK push — forced to KCB Buni until DARAJA_ENABLED=true
    // (see lib/payments/mpesa/gateway.ts), with a same-request fallback to
    // the other gateway if the primary attempt throws.
    const callbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}/api/payments/mpesa/instore-callback`;

    async function dispatchKcb(): Promise<string> {
      const { initiateKcbStkPush } = await import("@/lib/payments/kcb/kcb-client");
      const { resolveKcbBranch, originBranchTag } = await import("@/lib/payments/kcb/resolve-kcb-branch");
      // Falls back to the head office KCB Buni paybill when this branch has
      // no KCB account of its own (Eldoret/Kitengela/Mwea). order.branchId
      // stays the customer's real branch either way — only these credentials
      // and the invoice tag below change.
      const kcbBranch = await resolveKcbBranch(branch!);
      const formatOrderNumber = order.orderNumber?.slice(7, -1);
      const invoiceCode = `${kcbBranch.invoiceNumber}-${originBranchTag(branch!)}-${formatOrderNumber}`;
      const kcbRes = await initiateKcbStkPush({
        branch: {
          id: kcbBranch.id,
          shortcode: kcbBranch.shortcode,
          invoiceNumber: invoiceCode,
          consumerKeyEnc: kcbBranch.consumerKeyEnc,
          consumerSecretEnc: kcbBranch.consumerSecretEnc,
          apiKeyEnc: kcbBranch.apiKeyEnc ?? null,
        },
        phone: customerPhone,
        amountKes: totalKes,
        orderId: order.id,
        callbackUrl,
      });
      if (!kcbRes.CheckoutRequestID) {
        throw new Error("KCB STK push did not return a CheckoutRequestID");
      }
      return kcbRes.CheckoutRequestID;
    }

    async function dispatchDaraja(): Promise<string> {
      await getDarajaToken(branch!); // warm-up / validate credentials early
      const stkResponse = await initiateSTKPush({
        branch: branch!,
        phone: customerPhone,
        amountKes: totalKes / 100,
        orderId: order.orderNumber?.slice(7, -1) ?? order.id,
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
    console.info(`[instore/mpesa/initiate] Dispatching STK via ${primaryGateway} — order=${order.orderNumber}`);
    try {
      checkoutRequestId = await dispatch(primaryGateway);
      console.info(
        `[instore/mpesa/initiate] ${primaryGateway} dispatch succeeded — order=${order.orderNumber} checkout=${checkoutRequestId}`,
      );
    } catch (primaryErr) {
      reportError(primaryErr, {
        route: "POST /api/admin/orders/instore/mpesa/initiate",
        userId: admin.id,
        tags: { stage: "gateway_dispatch", gateway: primaryGateway },
      });
      console.error(`[instore/mpesa/initiate] ${primaryGateway} dispatch failed, falling back to ${fallbackGateway}`, primaryErr);
      console.info(`[instore/mpesa/initiate] Dispatching STK via fallback ${fallbackGateway} — order=${order.orderNumber}`);
      try {
        checkoutRequestId = await dispatch(fallbackGateway);
        gatewayUsed = fallbackGateway;
        console.info(
          `[instore/mpesa/initiate] ${fallbackGateway} fallback dispatch succeeded — order=${order.orderNumber} checkout=${checkoutRequestId}`,
        );
      } catch (fallbackErr) {
        reportError(fallbackErr, {
          route: "POST /api/admin/orders/instore/mpesa/initiate",
          userId: admin.id,
          tags: { stage: "gateway_dispatch_fallback", gateway: fallbackGateway },
        });
        console.error(`[instore/mpesa/initiate] ${fallbackGateway} fallback also failed`, fallbackErr);
        await markInStorePaymentFailed({
          transactionId: transaction.id,
          inStoreOrderId: order.id,
          reason: "Both M-Pesa gateways failed to initiate",
        });
        return err("STK_FAILED", "Could not initiate M-Pesa prompt. Please try again.", 502);
      }
    }

    // 3. Persist CheckoutRequestID + which gateway actually handled this.
    await db.inStoreTransaction.update({
      where: { id: transaction.id },
      data: { checkoutRequestId, mpesaGatewayUsed: gatewayUsed },
    });

    // Schedule a timeout: if the walk-in customer abandons the STK prompt
    // and no callback arrives within 15 minutes, flip the order to FAILED.
    await publishQstashJSON(
      "/api/admin/workers/check-failed-instore-payment",
      { inStoreOrderId: order.id, transactionId: transaction.id },
      { delay: PAYMENT_TIMEOUT_SECONDS },
    );

    console.info(
      `[instore/mpesa/initiate] STK push initiated — order=${order.orderNumber} checkout=${checkoutRequestId}`,
    );

    return ok({ inStoreOrderId: order.id, orderNumber: order.orderNumber });
  } catch (e) {
    reportError(e, {
      route: "POST /api/admin/orders/instore/mpesa/initiate",
      userId: admin.id,
      tags: { stage: "handler" },
    });
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
