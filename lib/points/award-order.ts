/**
 * Turns a confirmed-paid order into points, badges and perks.
 *
 * Called from the award-points QStash worker, which markPaymentSuccess() (and
 * its in-store twin) enqueues. Every award is idempotent through the ledger's
 * (userId, reason, refType, refId) unique constraint, so a replayed job is
 * harmless — this deliberately does no "have I run already?" bookkeeping of
 * its own.
 *
 * Everything is measured on the CASH portion. See lib/points/rules.ts.
 */

import { db } from "@/lib/db";
import { awardPoints } from "@/lib/points/ledger";
import { getUserStats } from "@/lib/points/stats";
import {
  orderBasePoints,
  valueTierFor,
  eligibleCents,
  streakAwards,
  VIP_COUPONS,
} from "@/lib/points/rules";
import type { RedeemRefType } from "@/lib/points/redeem";

export type AwardSummary = {
  userId: string;
  basePoints: number;
  tierPoints: number;
  tierLabel: string | null;
  streakPoints: number;
  totalPoints: number;
  perk: "VIP_1" | "VIP_2" | null;
  vipCouponCode: string | null;
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

/** Issues a single-customer VIP coupon. Code embeds the order so re-runs collide harmlessly. */
async function issueVipCoupon(
  perk: "VIP_1" | "VIP_2",
  userId: string,
  orderId: string,
): Promise<string | null> {
  const spec = VIP_COUPONS[perk];
  const code = `VIP${spec.percent}-${orderId.slice(0, 8).toUpperCase()}`;
  const endDate = new Date(Date.now() + spec.days * 86_400_000);

  try {
    await db.promotion.create({
      data: {
        name: `${perk} reward for ${userId}`,
        type: "PERCENTAGE",
        value: spec.percent,
        code,
        maxUses: spec.maxUses,
        maxUsesPerUser: spec.maxUses,
        maxDiscountKes: spec.maxDiscountKes,
        endDate,
        status: "active",
      },
    });
    return code;
  } catch {
    // Unique violation on `code` means a re-run already issued it.
    return code;
  }
}

export async function awardPointsForOrder(args: {
  orderId: string;
  refType?: RedeemRefType;
}): Promise<AwardSummary | null> {
  const refType = args.refType ?? "order";
  const order = await loadOrder(args.orderId, refType);
  if (!order) return null;

  const { userId } = order;
  const stats = await getUserStats(userId);

  // stats already includes this order, since it is PAID by the time we run.
  const basePoints = orderBasePoints(Math.max(1, stats.paidOrders));
  const eligible = eligibleCents(order);
  const tier = valueTierFor(eligible);

  await awardPoints({
    userId,
    delta: basePoints,
    reason: "ORDER_BASE",
    refType,
    refId: order.id,
    meta: { orderCount: stats.paidOrders, eligibleCents: eligible },
  });

  if (tier) {
    await awardPoints({
      userId,
      delta: tier.points,
      reason: "ORDER_VALUE_TIER",
      refType,
      refId: order.id,
      meta: { tier: tier.label, eligibleCents: eligible },
    });
  }

  // --- streaks -------------------------------------------------------------
  const [priorFourWeekAwards, sixMonthWeekly, sixMonthMonthly] = await Promise.all([
    db.pointsLedger.count({ where: { userId, reason: "STREAK_4W" } }),
    db.pointsLedger.count({ where: { userId, reason: "STREAK_6M_WEEKLY" } }),
    db.pointsLedger.count({ where: { userId, reason: "STREAK_6M_MONTHLY" } }),
  ]);

  const streaks = streakAwards({
    weekIndices: stats.weekIndices,
    monthIndices: stats.monthIndices,
    orderedAt: order.createdAt,
    priorFourWeekAwards,
    hasSixMonthWeekly: sixMonthWeekly > 0,
    hasSixMonthMonthly: sixMonthMonthly > 0,
  });

  let streakPoints = 0;
  for (const s of streaks) {
    // refId is the period, not the order — two orders in the same week must
    // not both close the same streak.
    const entry = await awardPoints({
      userId,
      delta: s.points,
      reason: s.reason,
      refType: "streak",
      refId: s.refSuffix,
      meta: { orderId: order.id },
    });
    if (entry) streakPoints += s.points;
  }

  // --- VIP perks -----------------------------------------------------------
  let vipCouponCode: string | null = null;
  if (tier?.perk) {
    vipCouponCode = await issueVipCoupon(tier.perk, userId, order.id);
  }

  return {
    userId,
    basePoints,
    tierPoints: tier?.points ?? 0,
    tierLabel: tier?.label ?? null,
    streakPoints,
    totalPoints: basePoints + (tier?.points ?? 0) + streakPoints,
    perk: tier?.perk ?? null,
    vipCouponCode,
  };
}
