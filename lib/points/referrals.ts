/**
 * Referrals.
 *
 * One 100-point bonus per referred person, ever — and it goes to exactly one
 * of two people, never both:
 *
 *  - If they were referred: their referrer gets it, once the referred
 *    person's own cumulative paid spend reaches REFERRAL_ACTIVATION_CENTS.
 *  - If nobody referred them: they get it themselves, once their own spend
 *    reaches the same threshold.
 *
 * That ceiling — a self-bonus plus up to MAX_REWARDED_REFERRALS payouts as a
 * referrer — is enforced centrally in awardPoints(), not here.
 */

// Reaches the database. Importing this from a client component pulls the
// Postgres driver into the browser bundle — this makes that fail loudly at
// the import instead of as a wall of pg module-not-found errors.
import "server-only";

import { db } from "@/lib/db";
import { awardPoints, ensureLoyaltyAccount } from "@/lib/points/ledger";
import { REFERRAL_BONUS_POINTS, REFERRAL_ACTIVATION_CENTS, MAX_REWARDED_REFERRALS } from "@/lib/points/rules";
import { getUserStats } from "@/lib/points/stats";
import { assessRisk, collectOrderSignals, unlockJoiningBonus, VOID_AT } from "@/lib/points/anti-abuse";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";

/** Looks up who owns a referral code — used to detect one typed into the checkout promo box. */
export async function referralOwnerForCode(code: string): Promise<string | null> {
  if (!code.trim()) return null;
  const loyalty = await db.loyaltyPoints.findUnique({
    where: { referralCode: code.trim().toUpperCase() },
    select: { userId: true },
  });
  return loyalty?.userId ?? null;
}

/**
 * Credits a new account's joining bonus, LOCKED until their first real
 * payment — but only if nobody referred them. A referred customer's bonus is
 * redirected to their referrer instead (see processReferralActivation), so
 * they never get one of their own.
 *
 * Called from the Better Auth user-create hook, and safe to call again later
 * (e.g. the signup UI posting a code after the account already exists) —
 * it checks the actual referral row rather than trusting attachReferral's
 * return value, so a repeat call for an already-referred user never
 * incorrectly locks a self-bonus on top.
 */
export async function grantJoiningBonus(args: { userId: string; referralCode?: string | null }) {
  await ensureLoyaltyAccount(args.userId);

  if (args.referralCode) await attachReferral({ userId: args.userId, code: args.referralCode });

  const hasReferral = await db.referral.findUnique({
    where: { referredUserId: args.userId },
    select: { id: true },
  });
  if (hasReferral) return;

  await awardPoints({
    userId: args.userId,
    lockedDelta: REFERRAL_BONUS_POINTS,
    reason: "SIGNUP_BONUS",
    refType: "signup",
    refId: args.userId,
  });
}

export type AttachResult =
  | { attached: true }
  | { attached: false; reason: "UNKNOWN_CODE" | "SELF_REFERRAL" | "ALREADY_REFERRED" | "CAP_REACHED" | "NOT_NEW" };

/**
 * Links a new customer to whoever referred them. No points change hands here
 * — the bonus is paid later, once the referred person's spend crosses the
 * activation threshold (see processReferralActivation).
 *
 * Only ever applies to a genuinely new customer: someone who has already paid
 * for an order cannot retroactively claim to have been referred.
 */
export async function attachReferral(args: {
  userId: string;
  code: string;
  /**
   * The order being paid for right now, excluded from the "have you ordered
   * before?" check. The award worker attaches referrals AFTER payment, so
   * without this the very order carrying the code would disqualify it.
   */
  ignoreOrderId?: string;
}): Promise<AttachResult> {
  const code = args.code.trim().toUpperCase();

  const referrer = await db.loyaltyPoints.findUnique({
    where: { referralCode: code },
    select: { userId: true },
  });
  if (!referrer) return { attached: false, reason: "UNKNOWN_CODE" };
  if (referrer.userId === args.userId) return { attached: false, reason: "SELF_REFERRAL" };

  const existing = await db.referral.findUnique({
    where: { referredUserId: args.userId },
    select: { id: true },
  });
  if (existing) return { attached: false, reason: "ALREADY_REFERRED" };

  const paidOrders = await db.order.count({
    where: {
      userId: args.userId,
      paymentStatus: "PAID",
      ...(args.ignoreOrderId ? { id: { not: args.ignoreOrderId } } : {}),
    },
  });
  if (paidOrders > 0) return { attached: false, reason: "NOT_NEW" };

  const rewarded = await db.referral.count({
    where: { referrerUserId: referrer.userId, rewardedAt: { not: null } },
  });
  if (rewarded >= MAX_REWARDED_REFERRALS) return { attached: false, reason: "CAP_REACHED" };

  await ensureLoyaltyAccount(args.userId);

  try {
    await db.referral.create({
      data: { referrerUserId: referrer.userId, referredUserId: args.userId, code },
    });
  } catch {
    // referredUserId is unique — one referrer per person, ever.
    return { attached: false, reason: "ALREADY_REFERRED" };
  }

  return { attached: true };
}

export type ReferralActivation = {
  /** True if a pending referral was resolved by this call (paid or capped-out). */
  referralResolved: boolean;
  referrerUserId: string | null;
  referrerPoints: number;
  /** True if this call unlocked the user's own locked joining bonus instead. */
  selfUnlocked: boolean;
  selfUnlockedPoints: number;
};

const NONE: ReferralActivation = {
  referralResolved: false,
  referrerUserId: null,
  referrerPoints: 0,
  selfUnlocked: false,
  selfUnlockedPoints: 0,
};

/**
 * Runs after every paid order, once the customer's cumulative lifetime paid
 * spend might have crossed REFERRAL_ACTIVATION_CENTS:
 *
 *  - If they were referred and that referral hasn't paid out yet, the
 *    referrer gets REFERRAL_BONUS_POINTS (subject to a fraud check on the
 *    referred customer's payment, and the per-referrer cap).
 *  - Otherwise, this unlocks the customer's own locked joining bonus, if any
 *    (a no-op if there isn't one, or it was already unlocked).
 *
 * Safe to call again on every later order: `referral.convertedAt` gates
 * re-entry into the referral branch, and unlockJoiningBonus no-ops once the
 * locked pot is empty.
 */
export async function processReferralActivation(args: {
  userId: string;
  orderId: string;
  refType: "order" | "inStoreOrder";
}): Promise<ReferralActivation> {
  const stats = await getUserStats(args.userId);
  if (stats.lifetimeSpendCents < REFERRAL_ACTIVATION_CENTS) return NONE;

  const referral = await db.referral.findUnique({
    where: { referredUserId: args.userId },
    select: { id: true, referrerUserId: true, convertedAt: true },
  });

  if (referral && !referral.convertedAt) {
    await collectOrderSignals({ userId: args.userId, orderId: args.orderId, refType: args.refType });
    const risk = await assessRisk(args.userId);
    const onlyIp = risk.reasons.length > 0 && risk.reasons.every((r) => r.kind === "IP");
    const acceptable = risk.score < VOID_AT || onlyIp;

    const rewarded = await db.referral.count({
      where: { referrerUserId: referral.referrerUserId, rewardedAt: { not: null } },
    });
    const withinCap = rewarded < MAX_REWARDED_REFERRALS;

    const entry =
      acceptable && withinCap
        ? await awardPoints({
            userId: referral.referrerUserId,
            delta: REFERRAL_BONUS_POINTS,
            reason: "REFERRAL_REWARD",
            refType: "referral",
            refId: args.userId,
          })
        : null;

    await db.referral.update({
      where: { id: referral.id },
      data: { convertedAt: new Date(), rewardedAt: entry ? new Date() : null },
    });

    if (entry) await notifyReferrer(referral.referrerUserId, REFERRAL_BONUS_POINTS);

    return {
      referralResolved: true,
      referrerUserId: referral.referrerUserId,
      referrerPoints: entry ? REFERRAL_BONUS_POINTS : 0,
      selfUnlocked: false,
      selfUnlockedPoints: 0,
    };
  }

  // No referral, or it already resolved — this user's own locked bonus.
  const unlock = await unlockJoiningBonus({ userId: args.userId, orderId: args.orderId, refType: args.refType });
  return {
    referralResolved: false,
    referrerUserId: null,
    referrerPoints: 0,
    selfUnlocked: unlock.unlockedPoints > 0,
    selfUnlockedPoints: unlock.unlockedPoints,
  };
}

async function notifyReferrer(referrerUserId: string, points: number) {
  const msg = `Someone you invited just crossed KSh 3,000 in orders — you earned ${points.toLocaleString()} points.`;

  await db.inboxMessage
    .create({
      data: {
        userId: referrerUserId,
        type: "SYSTEM",
        title: `You earned ${points.toLocaleString()} referral points`,
        body: msg,
      },
    })
    .catch((e) => console.error("[referrals] inbox failed", e));

  const user = await db.user.findUnique({
    where: { id: referrerUserId },
    select: { phone: true, phoneCode: true },
  });
  const phone = user?.phone ? combineLegacyPhone(user.phone, user.phoneCode) : null;
  if (hasSmsConfig() && phone) {
    await sendSms(phone, `Fechi Organics: ${msg}`).catch((e) =>
      console.error("[referrals] SMS failed", e),
    );
  }
}
