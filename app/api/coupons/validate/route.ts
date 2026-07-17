import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { resolvePromo } from "@/lib/promo";

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

    let result;
    try {
      result = await resolvePromo(code, subtotalKes, userId);
    } catch (e) {
      if (e instanceof Response) {
        const body = await e.json().catch(() => null);
        return ok({ valid: false, error: body?.error?.message ?? "Invalid or expired coupon code" });
      }
      throw e;
    }

    const { promo, discountKes: amountKes, deliveryFree } = result;
    let message = "";
    if (promo.type === "PERCENTAGE") {
      message = `${promo.value}% off — you save KES ${(amountKes / 100).toLocaleString("en-KE")}`;
    } else if (promo.type === "FIXED") {
      message = `KES ${(amountKes / 100).toLocaleString("en-KE")} off`;
    } else if (deliveryFree) {
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
