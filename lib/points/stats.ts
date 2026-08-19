/**
 * One snapshot of everything the earning rules and badge evaluators need.
 *
 * Built once per award pass and passed around, so a single order confirmation
 * runs these queries once rather than once per badge. With ~1,000 badges in the
 * catalog that difference is the whole design.
 *
 * Online orders (`order`) and walk-in orders (`inStoreOrder`) are both counted.
 * Note inStoreOrder.customerUserId is a bare string with no foreign key.
 */

import { db } from "@/lib/db";
import { isoWeekIndex, monthIndex } from "@/lib/points/rules";

export type UserStats = {
  userId: string;
  /** Paid orders across both channels. */
  paidOrders: number;
  /** Merchandise value of all paid orders, in cents (delivery excluded). */
  lifetimeSpendCents: number;
  largestOrderCents: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  /** ISO week indices (EAT) of every paid order. */
  weekIndices: number[];
  monthIndices: number[];
  longestWeekStreak: number;
  distinctProducts: number;
  distinctCategories: number;
  distinctCounties: number;
  pickupOrders: number;
  deliveryOrders: number;
  weekendOrders: number;
  nightOrders: number;
  earlyOrders: number;
  referralsConverted: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  reviewsWritten: number;
  wishlistItems: number;
  blogComments: number;
  blogReactions: number;
  badgeCount: number;
  /** Whole months between the first paid order and now. */
  monthsActive: number;
};

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function eatHour(d: Date): number {
  return new Date(d.getTime() + EAT_OFFSET_MS).getUTCHours();
}

function eatWeekday(d: Date): number {
  return new Date(d.getTime() + EAT_OFFSET_MS).getUTCDay(); // 0 = Sunday
}

/** Longest unbroken run anywhere in the set, not just the run ending now. */
function longestRun(indices: number[]): number {
  if (indices.length === 0) return 0;
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const [
    online,
    inStore,
    loyalty,
    referralsConverted,
    reviewsWritten,
    wishlistItems,
    blogComments,
    blogReactions,
    badgeCount,
  ] = await Promise.all([
      db.order.findMany({
        where: { userId, paymentStatus: "PAID" },
        select: {
          createdAt: true,
          subtotalKes: true,
          discountKes: true,
          pointsDiscountKes: true,
          deliveryType: true,
          deliveryCounty: true,
          items: { select: { productId: true } },
        },
      }),
      db.inStoreOrder.findMany({
        where: { customerUserId: userId, paymentStatus: "PAID" },
        select: {
          createdAt: true,
          subtotalKes: true,
          discountKes: true,
          pointsDiscountKes: true,
          items: { select: { productId: true } },
        },
      }),
      db.loyaltyPoints.findUnique({
        where: { userId },
        select: { lifetimeEarned: true, lifetimeRedeemed: true },
      }),
      db.referral.count({ where: { referrerUserId: userId, convertedAt: { not: null } } }),
      db.order.count({ where: { userId, reviewedAt: { not: null } } }),
    db.wishlistItem.count({ where: { userId } }),
    db.blogComment.count({ where: { userId } }),
    db.blogReaction.count({ where: { userId } }),
    db.userBadge.count({ where: { userId } }),
  ]);

  type Row = {
    createdAt: Date;
    merchCents: number;
    productIds: string[];
    county: string | null;
    isPickup: boolean;
  };

  const rows: Row[] = [
    ...online.map((o) => ({
      createdAt: o.createdAt,
      merchCents: Math.max(0, o.subtotalKes - o.discountKes - o.pointsDiscountKes),
      productIds: o.items.map((i) => i.productId),
      county: o.deliveryCounty,
      isPickup: o.deliveryType === "PICKUP",
    })),
    ...inStore.map((o) => ({
      createdAt: o.createdAt,
      merchCents: Math.max(0, o.subtotalKes - o.discountKes - o.pointsDiscountKes),
      productIds: o.items.map((i) => i.productId),
      county: null,
      // A walk-in is collected in person — the pickup case by definition.
      isPickup: true,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const productIds = new Set<string>();
  const counties = new Set<string>();
  const weekIndices: number[] = [];
  const monthIndices: number[] = [];
  let lifetimeSpendCents = 0;
  let largestOrderCents = 0;
  let pickupOrders = 0;
  let weekendOrders = 0;
  let nightOrders = 0;
  let earlyOrders = 0;

  for (const r of rows) {
    lifetimeSpendCents += r.merchCents;
    if (r.merchCents > largestOrderCents) largestOrderCents = r.merchCents;
    r.productIds.forEach((p) => productIds.add(p));
    if (r.county) counties.add(r.county.trim().toLowerCase());
    weekIndices.push(isoWeekIndex(r.createdAt));
    monthIndices.push(monthIndex(r.createdAt));
    if (r.isPickup) pickupOrders++;
    const day = eatWeekday(r.createdAt);
    if (day === 0 || day === 6) weekendOrders++;
    const hour = eatHour(r.createdAt);
    if (hour >= 22 || hour < 4) nightOrders++;
    if (hour >= 4 && hour < 8) earlyOrders++;
  }

  const distinctCategories =
    productIds.size === 0
      ? 0
      : (
          await db.product.findMany({
            where: { id: { in: [...productIds] } },
            select: { categoryId: true },
            distinct: ["categoryId"],
          })
        ).length;

  const firstOrderAt = rows[0]?.createdAt ?? null;
  const lastOrderAt = rows[rows.length - 1]?.createdAt ?? null;

  return {
    userId,
    paidOrders: rows.length,
    lifetimeSpendCents,
    largestOrderCents,
    firstOrderAt,
    lastOrderAt,
    weekIndices,
    monthIndices,
    longestWeekStreak: longestRun(weekIndices),
    distinctProducts: productIds.size,
    distinctCategories,
    distinctCounties: counties.size,
    pickupOrders,
    deliveryOrders: rows.length - pickupOrders,
    weekendOrders,
    nightOrders,
    earlyOrders,
    referralsConverted,
    lifetimeEarned: loyalty?.lifetimeEarned ?? 0,
    lifetimeRedeemed: loyalty?.lifetimeRedeemed ?? 0,
    reviewsWritten,
    wishlistItems,
    blogComments,
    blogReactions,
    badgeCount,
    monthsActive: firstOrderAt ? monthIndex(new Date()) - monthIndex(firstOrderAt) + 1 : 0,
  };
}
