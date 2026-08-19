/**
 * Earning rules. Pure functions, no I/O — every branch here is covered by
 * __tests__/points-rules.test.ts.
 *
 * Everything is computed on the CASH portion of an order. A customer who pays
 * with points earns nothing on the points-funded part, otherwise a 50,000 order
 * paid entirely in points would hand back 5,000 points and the balance would
 * refill itself every cycle.
 */

/** Money is integer cents repo-wide. */
const KES = 100;

/**
 * Points for placing an order, by the customer's lifetime paid-order count
 * (`n` includes the order being awarded, so the first order is n = 1).
 *
 *   n 1..10  700, 650, 600, 550, 500, 450, 400, 350, 300, 250
 *   n 11..49 200 flat
 *   n 50+    300
 */
export function orderBasePoints(n: number): number {
  if (n < 1) return 0;
  if (n <= 10) return 750 - 50 * n;
  if (n < 50) return 200;
  return 300;
}

export type ValueTier = {
  /** Inclusive floor, in cents, on the order's eligible cash value. */
  minCents: number;
  points: number;
  /** Perk bundle to issue, if any. */
  perk: "VIP_1" | "VIP_2" | null;
  label: string;
};

/** Ordered high to low — the first match wins, bands are NOT cumulative. */
export const VALUE_TIERS: readonly ValueTier[] = [
  { minCents: 250_000 * KES, points: 50_000, perk: "VIP_2", label: "Inner Circle" },
  { minCents: 100_000 * KES, points: 20_000, perk: "VIP_1", label: "VIP" },
  { minCents: 50_000 * KES, points: 5_000, perk: null, label: "Grand Order" },
  { minCents: 25_000 * KES, points: 1_500, perk: null, label: "Major Order" },
  { minCents: 15_000 * KES, points: 1_000, perk: null, label: "Big Order" },
] as const;

export function valueTierFor(eligibleCents: number): ValueTier | null {
  return VALUE_TIERS.find((t) => eligibleCents >= t.minCents) ?? null;
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
// Streaks
//
// Weeks are ISO weeks (Mon-Sun) in Africa/Nairobi. Kenya is a fixed UTC+3 with
// no DST, so a constant offset is exact — no timezone library needed.
// ponytail: shifting the instant by +3h and reading UTC parts is the whole
// conversion. Reach for a tz library only if Fechi ever sells outside EAT.
// ---------------------------------------------------------------------------

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Days since the Unix epoch, floored to the Monday of that date's ISO week, in EAT. */
export function isoWeekIndex(date: Date): number {
  const eatDays = Math.floor((date.getTime() + EAT_OFFSET_MS) / 86_400_000);
  // 1970-01-01 was a Thursday, so +3 aligns the floor to Monday.
  return Math.floor((eatDays + 3) / 7);
}

/** Months since year 0 in EAT — comparable with plain subtraction. */
export function monthIndex(date: Date): number {
  const eat = new Date(date.getTime() + EAT_OFFSET_MS);
  return eat.getUTCFullYear() * 12 + eat.getUTCMonth();
}

/**
 * Length of the unbroken run of consecutive periods ending at `current`.
 * `periods` is any collection of period indices (weeks or months); duplicates
 * and ordering do not matter.
 */
export function consecutiveRunEndingAt(periods: Iterable<number>, current: number): number {
  const set = new Set(periods);
  let run = 0;
  while (set.has(current - run)) run++;
  return run;
}

export const STREAK_4W_POINTS = 500;
/** Four times lifetime, i.e. 2,000 points total from the four-week streak. */
export const STREAK_4W_MAX_AWARDS = 4;
export const STREAK_6M_WEEKLY_POINTS = 3_000;
export const STREAK_6M_MONTHLY_POINTS = 2_000;

export type StreakAward = {
  reason: "STREAK_4W" | "STREAK_6M_WEEKLY" | "STREAK_6M_MONTHLY";
  points: number;
  /** Distinguishes repeat awards of the same reason in the ledger's unique key. */
  refSuffix: string;
};

/**
 * Which streak rewards this order earns.
 *
 * - 4 consecutive weeks with at least one paid order -> +500, up to 4 times.
 * - 26 consecutive weeks -> +3,000, once.
 * - at least one paid order in each of 6 consecutive months -> +2,000, once.
 *
 * The weekly and monthly six-month awards are mutually exclusive: someone who
 * bought every week for six months gets 3,000, not 3,000 + 2,000.
 */
export function streakAwards(input: {
  /** ISO week indices of every paid order by this customer, including this one. */
  weekIndices: Iterable<number>;
  /** Month indices of every paid order by this customer, including this one. */
  monthIndices: Iterable<number>;
  orderedAt: Date;
  /** How many STREAK_4W awards this customer already has. */
  priorFourWeekAwards: number;
  hasSixMonthWeekly: boolean;
  hasSixMonthMonthly: boolean;
}): StreakAward[] {
  const awards: StreakAward[] = [];
  const thisWeek = isoWeekIndex(input.orderedAt);
  const thisMonth = monthIndex(input.orderedAt);

  const weekRun = consecutiveRunEndingAt(input.weekIndices, thisWeek);
  const monthRun = consecutiveRunEndingAt(input.monthIndices, thisMonth);

  // Fires on week 4, 8, 12, 16 of an unbroken run, and again on any later run.
  if (weekRun > 0 && weekRun % 4 === 0 && input.priorFourWeekAwards < STREAK_4W_MAX_AWARDS) {
    awards.push({
      reason: "STREAK_4W",
      points: STREAK_4W_POINTS,
      refSuffix: `w${thisWeek}`,
    });
  }

  if (weekRun >= 26 && !input.hasSixMonthWeekly) {
    awards.push({
      reason: "STREAK_6M_WEEKLY",
      points: STREAK_6M_WEEKLY_POINTS,
      refSuffix: `w${thisWeek}`,
    });
  } else if (monthRun >= 6 && !input.hasSixMonthMonthly && !input.hasSixMonthWeekly) {
    awards.push({
      reason: "STREAK_6M_MONTHLY",
      points: STREAK_6M_MONTHLY_POINTS,
      refSuffix: `m${thisMonth}`,
    });
  }

  return awards;
}

// ---------------------------------------------------------------------------
// Free (non-purchase) points
// ---------------------------------------------------------------------------

export const SIGNUP_BONUS_POINTS = 4_000;
export const REFERRED_BONUS_POINTS = 500;
export const REFERRAL_REWARD_POINTS = 1_000;
export const MAX_REWARDED_REFERRALS = 5;

// ---------------------------------------------------------------------------
// VIP perks — auto-issued coupons. The non-code perks (events, masterclass,
// one-to-one, clothing, gift) are fulfilment tasks, not automation.
// ---------------------------------------------------------------------------

export const VIP_COUPONS = {
  VIP_1: { percent: 50, maxUses: 5, maxDiscountKes: 15_000 * KES, days: 365 },
  VIP_2: { percent: 70, maxUses: 5, maxDiscountKes: 35_000 * KES, days: 365 },
} as const;
