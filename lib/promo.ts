import { db } from "@/lib/db";
import { Err } from "@/lib/api";

export async function resolvePromo(
  promoCode: string,
  subtotalKes: number,
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
