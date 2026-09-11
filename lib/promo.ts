import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import type { TxClient } from "@/lib/orders/generate-order-number";
import { normalizePhoneE164 } from "@/lib/phone";

export async function resolvePromo(
  promoCode: string,
  subtotalKes: number,
  userId?: string,
  // Guest checkout mints a brand-new userId for every unseen email
  // (findOrCreateGuestCustomer), which makes the userId-only maxUsesPerUser
  // check below trivially bypassable by rotating emails. Passing the
  // checkout phone number lets the count also catch redemptions by anyone
  // who has previously used this coupon under the same phone, regardless of
  // which userId that redemption happened under.
  phone?: string | null,
): Promise<{
  promo: { id: string; type: string; value: number; ownerUserId: string | null; pointsAward: number };
  discountKes: number;
  deliveryFree: boolean;
}> {
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

  // Soft-deleted by an admin. Kept in the table for the audit trail, but dead
  // at checkout.
  if (promo.disabledAt !== null) throw Err.validation("This code is no longer active");

  // Carries loyalty points and hasn't been approved yet. A coupon that mints
  // points must not be usable while its approval is still queued.
  if (promo.approvalStatus === "PENDING") {
    throw Err.validation("This code is awaiting approval");
  }

  // Customer coupons are referral codes — you cannot refer yourself.
  if (promo.ownerUserId !== null && promo.ownerUserId === userId) {
    throw Err.validation("You can't use your own referral code");
  }

  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    throw Err.validation("Coupon usage limit reached");
  }
  if (promo.minOrder !== null && subtotalKes < promo.minOrder) {
    throw Err.validation("Order does not meet minimum for this coupon");
  }

  // 0 = unlimited reuse for a single user; otherwise cap at maxUsesPerUser.
  // Also counts redemptions by the same phone number, not just the same
  // userId — guest checkout mints a brand-new userId for every unseen
  // email (findOrCreateGuestCustomer), so a userId-only check here is
  // trivially bypassed by resubmitting with a different email each time.
  // Last-9-digits match tolerates 0712.../254712.../+254712... variations
  // in how the phone ended up stored.
  if (promo.maxUsesPerUser !== 0 && (userId || phone)) {
    const last9 = phone ? (normalizePhoneE164(phone) ?? phone).replace(/\D/g, "").slice(-9) : null;
    // couponRedemption.userId has no Prisma relation to `user` (a plain
    // indexed string, no FK) — resolve matching user ids by phone first,
    // rather than adding a relation that would need a real FK migration.
    const phoneUserIds = last9
      ? (await db.user.findMany({ where: { phone: { contains: last9 } }, select: { id: true } })).map((u) => u.id)
      : [];
    const candidateUserIds = [...new Set([...(userId ? [userId] : []), ...phoneUserIds])];
    const timesUsed = candidateUserIds.length
      ? await db.couponRedemption.count({
          where: { couponId: promo.id, userId: { in: candidateUserIds } },
        })
      : 0;
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

  // Absolute ceiling on the discount, in cents. The auto-issued VIP rewards are
  // "50% off, capped at KSh 15,000" and "70% off, capped at KSh 35,000" — the
  // column was being written by issueVipCoupon() but never read here, so those
  // codes were uncapped: 70% of a KSh 500,000 order gave away KSh 350,000.
  if (promo.maxDiscountKes !== null && discountKes > promo.maxDiscountKes) {
    discountKes = promo.maxDiscountKes;
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
