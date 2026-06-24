import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

// ---------------------------------------------------------------------------
// GET /api/coupons/validate?code=PROMO10&subtotal=250000
// Auth required. Validates the coupon for the calling user without redeeming.
// subtotal is in cents (KES × 100) — the same unit used throughout the app.
// Returns:
//   { ok: true, data: { valid: true, discount: { type, value, amountKes }, message } }
//   { ok: true, data: { valid: false, error: "reason" } }
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim().toUpperCase();
    const subtotalParam = searchParams.get("subtotal");

    if (!code) return Err.validation("code is required");

    const subtotalKes = subtotalParam ? parseInt(subtotalParam, 10) : 0;
    if (isNaN(subtotalKes) || subtotalKes < 0) {
      return Err.validation("subtotal must be a non-negative integer (cents)");
    }

    const userId = session.user.id;
    const now = new Date();

    // Look up active, in-window promotion with this code
    const promo = await db.promotion.findFirst({
      where: {
        code,
        status: "active",
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
    });

    if (!promo) {
      return ok({ valid: false, error: "Invalid or expired coupon code" });
    }

    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      return ok({ valid: false, error: "Coupon usage limit reached" });
    }

    const alreadyUsed = await db.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: promo.id, userId } },
    });
    if (alreadyUsed) {
      return ok({ valid: false, error: "You have already used this coupon" });
    }

    if (promo.minOrder !== null && subtotalKes < promo.minOrder) {
      const minKes = (promo.minOrder / 100).toLocaleString("en-KE");
      return ok({ valid: false, error: `Minimum order of KES ${minKes} required` });
    }

    // Calculate the discount amount for display purposes
    let amountKes = 0;
    let message = "";

    if (promo.type === "PERCENTAGE") {
      amountKes = Math.round(subtotalKes * promo.value / 100);
      message = `${promo.value}% off — you save KES ${(amountKes / 100).toLocaleString("en-KE")}`;
    } else if (promo.type === "FIXED") {
      amountKes = Math.min(Math.round(promo.value * 100), subtotalKes);
      message = `KES ${(amountKes / 100).toLocaleString("en-KE")} off`;
    } else if (promo.type === "FREE_SHIPPING") {
      amountKes = 0; // shipping discount — exact saving depends on delivery zone
      message = "Free shipping applied";
    }

    console.info("[coupons/validate] valid code", code, "for user", userId);
    return ok({
      valid: true,
      discount: { type: promo.type, value: promo.value, amountKes },
      message,
    });
  } catch (e) {
    console.error("[coupons/validate] error", e);
    return Err.internal();
  }
}
