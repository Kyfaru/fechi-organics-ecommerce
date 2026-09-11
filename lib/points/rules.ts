/**
 * Earning rules. Pure functions, no I/O — every branch here is covered by
 * __tests__/points-rules.test.ts.
 *
 * Everything is computed on the CASH portion of an order. A customer who pays
 * with points earns nothing on the points-funded part, otherwise an order paid
 * entirely in points would hand back points on itself and the balance would
 * refill itself every cycle.
 */

/** Money is integer cents repo-wide. */
const KES = 100;

// ---------------------------------------------------------------------------
// Client-safe constants.
//
// These live here, not in ledger.ts or referrals.ts, because this module is
// pure — it imports nothing. Those two import @/lib/db, so a client component
// importing a constant from either one pulls the Postgres driver into the
// browser bundle and the build dies on `dns`/`fs`/`net`/`tls`. That is exactly
// what happened to /loyalty-points. Anything the storefront needs to display
// belongs here.
// ---------------------------------------------------------------------------

/** 1 point = KSh 1.00 = 100 cents. */
export const CENTS_PER_POINT = 100;

export function pointsToCents(points: number): number {
  return points * CENTS_PER_POINT;
}

/** Points needed to cover `cents`, rounded up so the cash remainder is never negative. */
export function centsToPoints(cents: number): number {
  return Math.ceil(cents / CENTS_PER_POINT);
}

/** How much cash (in KSh) earns one point. */
export const KES_PER_EARNED_POINT = 120;

/** Points earned on cash actually paid: 1 point per KSh 120, floored. */
export function earnedPointsForCents(cents: number): number {
  return Math.floor(cents / (KES_PER_EARNED_POINT * KES));
}

/**
 * The order value that earning is measured against: merchandise only, after
 * every discount, excluding delivery. Matches how revenue is already computed
 * elsewhere (totalKes - deliveryKes).
 */
export function eligibleCents(order: {
  subtotalKes: number;
  discountKes: number;
  pointsDiscountKes: number;
}): number {
  return Math.max(0, order.subtotalKes - order.discountKes - order.pointsDiscountKes);
}

// ---------------------------------------------------------------------------
// Referral / joining bonus
//
// One 100-point bonus per person, ever: to themselves if nobody referred
// them, or redirected to their referrer once they reach the spend threshold
// below. No free points anywhere else — every point requires a real payment.
// ---------------------------------------------------------------------------

export const REFERRAL_BONUS_POINTS = 100;
/** Cumulative lifetime paid spend, in cents, that unlocks the bonus above. */
export const REFERRAL_ACTIVATION_CENTS = 3_000 * KES;
export const MAX_REWARDED_REFERRALS = 5;
