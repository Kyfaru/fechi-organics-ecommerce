/**
 * Turns a confirmed-paid order into points.
 *
 * Called from the award-points QStash worker, which markPaymentSuccess() (and
 * its in-store twin) enqueues. Every award is idempotent through the ledger's
 * (userId, reason, refType, refId) unique constraint, so a replayed job is
 * harmless — this deliberately does no "have I run already?" bookkeeping of
 * its own.
 *
 * Points are a flat rate on the CASH portion only. See lib/points/rules.ts.
 */

// Reaches the database. Importing this from a client component pulls the
// Postgres driver into the browser bundle — this makes that fail loudly at
// the import instead of as a wall of pg module-not-found errors.
import "server-only";

import { db } from "@/lib/db";
import { awardPoints } from "@/lib/points/ledger";
import { eligibleCents, earnedPointsForCents } from "@/lib/points/rules";
import type { RedeemRefType } from "@/lib/points/redeem";

export type AwardSummary = {
  userId: string;
  points: number;
  eligibleCents: number;
};

type OrderShape = {
  id: string;
  userId: string;
  createdAt: Date;
  subtotalKes: number;
  discountKes: number;
  pointsDiscountKes: number;
};

async function loadOrder(orderId: string, refType: RedeemRefType): Promise<OrderShape | null> {
  if (refType === "order") {
    const o = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        paymentStatus: true,
        subtotalKes: true,
        discountKes: true,
        pointsDiscountKes: true,
      },
    });
    if (!o?.userId || o.paymentStatus !== "PAID") return null;
    return { ...o, userId: o.userId };
  }

  const o = await db.inStoreOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerUserId: true,
      createdAt: true,
      paymentStatus: true,
      subtotalKes: true,
      discountKes: true,
      pointsDiscountKes: true,
    },
  });
  // customerUserId is a bare string with no FK — a walk-in without an account
  // simply earns nothing.
  if (!o?.customerUserId || o.paymentStatus !== "PAID") return null;
  return { ...o, userId: o.customerUserId };
}

export async function awardPointsForOrder(args: {
  orderId: string;
  refType?: RedeemRefType;
}): Promise<AwardSummary | null> {
  const refType = args.refType ?? "order";
  const order = await loadOrder(args.orderId, refType);
  if (!order) return null;

  const { userId } = order;
  const eligible = eligibleCents(order);
  const points = earnedPointsForCents(eligible);

  if (points > 0) {
    await awardPoints({
      userId,
      delta: points,
      reason: "ORDER_BASE",
      refType,
      refId: order.id,
      meta: { eligibleCents: eligible },
    });
  }

  return { userId, points, eligibleCents: eligible };
}
