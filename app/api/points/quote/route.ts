/**
 * GET /api/points/quote?gross=<cents>&points=<n>
 *
 * Auth required. Tells the checkout UI what a points redemption would be worth
 * without spending anything. Mirrors /api/coupons/validate so the storefront
 * and the in-store wizard can consume the same shape.
 *
 * `gross` is the bill AFTER any coupon, in cents — points always apply last.
 * Omit `points` to get the maximum the customer could spend on this order.
 *
 * The arithmetic here is the same applyPoints() the payment routes use, so the
 * quoted total and the charged total cannot drift.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { ok, Err } from "@/lib/api";
import { getBalance, CENTS_PER_POINT } from "@/lib/points/ledger";
import { applyPoints } from "@/lib/checkout/compute-totals";
import { makeRatelimit } from "@/lib/ratelimit";
import { Ratelimit } from "@upstash/ratelimit";
import { reportError } from "@/lib/observability";

const limiter = makeRatelimit(Ratelimit.slidingWindow(30, "1 m"), "points_quote");

export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();
    const userId = session.user.id;

    // makeRatelimit returns null when Redis env is unset — null-gate it.
    if (limiter) {
      const { success } = await limiter.limit(userId);
      if (!success) return Err.rateLimited();
    }

    const { searchParams } = new URL(req.url);
    const grossParam = searchParams.get("gross");
    const pointsParam = searchParams.get("points");

    const grossCents = grossParam ? parseInt(grossParam, 10) : 0;
    if (Number.isNaN(grossCents) || grossCents < 0) {
      return Err.validation("gross must be a non-negative integer (cents)");
    }

    const balance = await getBalance(userId);

    const maxRedeemable = applyPoints(grossCents, Number.MAX_SAFE_INTEGER, balance.available);

    if (pointsParam === null) {
      return ok({
        available: balance.available,
        locked: balance.locked,
        centsPerPoint: CENTS_PER_POINT,
        maxRedeemablePoints: maxRedeemable.pointsRedeemed,
        maxDiscountCents: maxRedeemable.pointsDiscountCents,
      });
    }

    const requested = parseInt(pointsParam, 10);
    if (Number.isNaN(requested) || requested < 0) {
      return Err.validation("points must be a non-negative integer");
    }

    if (requested > balance.available) {
      return ok({
        valid: false,
        available: balance.available,
        locked: balance.locked,
        centsPerPoint: CENTS_PER_POINT,
        maxRedeemablePoints: maxRedeemable.pointsRedeemed,
        maxDiscountCents: maxRedeemable.pointsDiscountCents,
        error:
          balance.locked > 0 && requested <= balance.available + balance.locked
            ? `You have ${balance.locked.toLocaleString()} points that unlock with your first order`
            : `You only have ${balance.available.toLocaleString()} points available`,
      });
    }

    const { pointsRedeemed, pointsDiscountCents } = applyPoints(grossCents, requested, balance.available);

    return ok({
      valid: true,
      available: balance.available,
      locked: balance.locked,
      centsPerPoint: CENTS_PER_POINT,
      pointsRedeemed,
      discountCents: pointsDiscountCents,
      remainingCents: Math.max(0, grossCents - pointsDiscountCents),
      maxRedeemablePoints: maxRedeemable.pointsRedeemed,
      maxDiscountCents: maxRedeemable.pointsDiscountCents,
      message: `${pointsRedeemed.toLocaleString()} points — KES ${(pointsDiscountCents / 100).toLocaleString("en-KE")} off`,
    });
  } catch (e) {
    reportError(e, { route: "GET /api/points/quote", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
