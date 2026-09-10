import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import type { TxClient } from "@/lib/orders/generate-order-number";

export async function resolvePromo(
  promoCode: string,
  subtotalKes: number,
  userId?: string,
): Promise<{ promo: { id: string; type: string; value: number }; discountKes: number; deliveryFree: boolean }> {
  const now = new Date();
  const promo = await db.promotion.findFirst({
    where: {
      code: promoCode,
      status: "active",
      OR: [{ startDate: null }, { startDate: { lte: now } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
    },
  });

  if (!promo) throw Err.validation("Invalid or expired coupon code");
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    throw Err.validation("Coupon usage limit reached");
  }
  if (promo.minOrder !== null && subtotalKes < promo.minOrder) {
    throw Err.validation("Order does not meet minimum for this coupon");
  }

  // 0 = unlimited reuse for a single user; otherwise cap at maxUsesPerUser.
  if (userId && promo.maxUsesPerUser !== 0) {
    const timesUsed = await db.couponRedemption.count({
      where: { couponId: promo.id, userId },
    });
    if (timesUsed >= promo.maxUsesPerUser) {
      throw Err.validation("You've already used this code the maximum number of times");
    }
  }

  let discountKes = 0;
  let deliveryFree = false;

  if (promo.type === "PERCENTAGE") {
    discountKes = Math.round(subtotalKes * promo.value / 100);
  } else if (promo.type === "FIXED") {
    discountKes = Math.min(Math.round(promo.value * 100), subtotalKes);
  } else if (promo.type === "FREE_SHIPPING") {
    deliveryFree = true;
  }

  return { promo, discountKes, deliveryFree };
}

/**
 * Records a coupon redemption and increments the promotion's usedCount.
 * Call this once per order at the point the order/payment is actually
 * finalized — never on a retried/failed attempt, to avoid over-counting.
 * Accepts an optional transaction client so callers can run it atomically
 * alongside their own order-creation write.
 */
export async function recordCouponRedemption(
  couponId: string,
  userId: string,
  orderId: string,
  tx: TxClient | typeof db = db,
) {
  await tx.couponRedemption.create({ data: { couponId, userId, orderId } });
  await tx.promotion.update({
    where: { id: couponId },
    data: { usedCount: { increment: 1 } },
  });
}
