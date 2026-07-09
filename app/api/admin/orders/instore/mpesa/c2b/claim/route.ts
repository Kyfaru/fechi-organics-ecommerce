/**
 * POST /api/admin/orders/instore/mpesa/c2b/claim
 *
 * Claims an already-received till/paybill payment (logged by the
 * Confirmation webhook into mpesaC2bTransaction) against a new in-store
 * order the admin is building. Unlike the STK flow, payment already
 * happened — this route creates the order + transaction as PAID directly,
 * no PENDING step.
 *
 * Race safety: two admins could try to claim the same C2B row at once (or
 * the same admin double-clicks). The claim re-reads the row inside the
 * write transaction and rejects if it's already been matched.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { resolvePromo } from "@/lib/promo";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { getRedis } from "@/lib/redis";
import { paymentChannel } from "@/lib/payment-channel";
import { buildInStoreOrderNumber } from "@/lib/orders/generate-instore-order-number";
import { getOrCreateInStoreInvoice } from "@/lib/invoice/get-or-create-instore-invoice";

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const bodySchema = z
  .object({
    c2bTransactionId: z.string(),
    customerUserId: z.string().uuid().nullable().optional(),
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    customerEmail: z.string().email().optional(),
    items: z
      .array(z.object({ productId: z.string(), quantity: z.number().int().positive() }))
      .min(1),
    promoCode: z.string().optional(),
    branchId: z.string().uuid().optional(),
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

// Sentinel used to short-circuit db.$transaction with a specific HTTP outcome
// without the generic catch-all in the outer try/catch swallowing it.
class AlreadyClaimedError extends Error {}

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Err.validation("Invalid request body");
  }

  const { c2bTransactionId, customerUserId, customerName, customerPhone, customerEmail, items, promoCode, branchId } =
    parsed;

  try {
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

    const c2bRow = await db.mpesaC2bTransaction.findUnique({ where: { id: c2bTransactionId } });
    if (!c2bRow) return Err.notFound("C2B transaction");

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
    if (normalizedPromoCode) {
      try {
        const r = await resolvePromo(normalizedPromoCode, subtotalKes);
        discountKes = r.discountKes;
      } catch {
        /* invalid/expired — discount stays 0 */
      }
    }
    const totalKes = Math.max(0, subtotalKes - discountKes);

    // The admin can only claim a C2B row whose amount exactly matches the
    // computed order total — this is the only signal tying a till payment
    // to a specific walk-in order.
    if (c2bRow.transAmount !== totalKes) {
      return err("AMOUNT_MISMATCH", "Amount mismatch", 400);
    }

    const now = new Date();
    const orderNumber = buildInStoreOrderNumber(now, branch.shortcode);

    let result: { orderId: string; orderNumber: string | null };
    try {
      result = await db.$transaction(async (tx: TxClient) => {
        // Re-read inside the transaction to close the race window between
        // the earlier findUnique and this write.
        const freshRow = await tx.mpesaC2bTransaction.findUnique({
          where: { id: c2bTransactionId },
          select: { matchedInStoreTransactionId: true },
        });
        if (!freshRow) throw new AlreadyClaimedError();
        if (freshRow.matchedInStoreTransactionId !== null) throw new AlreadyClaimedError();

        const order = await tx.inStoreOrder.create({
          data: {
            orderNumber,
            branchId: branch.id,
            createdByAdminId: admin.id,
            createdByAdminName: admin.name,
            customerUserId: customerUserId ?? null,
            customerName: customerName ?? null,
            customerPhone: customerPhone ?? null,
            customerEmail: customerEmail ?? null,
            subtotalKes,
            discountKes,
            promoCode: normalizedPromoCode ?? null,
            totalKes,
            paymentStatus: "PAID",
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

        const transaction = await tx.inStoreTransaction.create({
          data: {
            inStoreOrderId: order.id,
            provider: "MPESA_C2B",
            amount: totalKes,
            status: "SUCCESS",
            mpesaReceiptNumber: c2bRow.transId,
            matchedC2bTransactionId: c2bRow.id,
          },
        });

        // Denormalized pointer maintained by hand on the C2B side — no DB-level
        // FK (see schema comment above the mpesaC2bTransaction model).
        await tx.mpesaC2bTransaction.update({
          where: { id: c2bRow.id },
          data: { matchedInStoreTransactionId: transaction.id },
        });

        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }

        return { orderId: order.id, orderNumber: order.orderNumber };
      });
    } catch (e) {
      if (e instanceof AlreadyClaimedError) {
        return err("ALREADY_CLAIMED", "Already claimed", 409);
      }
      throw e;
    }

    // Pre-warm the invoice PDF synchronously — C2B claim doesn't go through
    // markInStorePaymentSuccess (it creates the order as PAID directly rather
    // than updating a PENDING one), so it needs its own copy of the same
    // "never block payment success on this" pre-generation call.
    try {
      await getOrCreateInStoreInvoice(result.orderId);
    } catch (e) {
      console.error("[instore/mpesa/c2b/claim] Invoice pre-generation failed:", e);
    }

    // Best-effort Redis signal — same shape as markInStorePaymentSuccess's,
    // must never throw.
    try {
      await getRedis().set(
        paymentChannel(result.orderId),
        JSON.stringify({
          type: "instore_payment_success",
          inStoreOrderId: result.orderId,
          timestamp: Date.now(),
        }),
        { ex: 900 },
      );
    } catch (e) {
      console.error("[instore/mpesa/c2b/claim] Redis set failed:", e);
    }

    console.info(
      `[instore/mpesa/c2b/claim] Claimed — order=${result.orderNumber} c2b=${c2bRow.id}`,
    );

    return ok({ inStoreOrderId: result.orderId, orderNumber: result.orderNumber });
  } catch (e) {
    console.error("[instore/mpesa/c2b/claim] POST error", e);
    return Err.internal();
  }
}
