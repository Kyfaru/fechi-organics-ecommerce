/**
 * Referrals.
 *
 * A referral pays out when the referred customer's FIRST order is paid, not
 * when they sign up — otherwise the code is just a second way to farm the
 * joining bonus. Five rewarded referrals per customer, so the most anyone can
 * collect without ever buying anything is 9,500 points:
 *
 *   4,000 signup + 500 for being referred + 5 x 1,000 referrals
 *
 * That ceiling is enforced centrally in awardPoints(), not here.
 */

// Reaches the database. Importing this from a client component pulls the
// Postgres driver into the browser bundle — this makes that fail loudly at
// the import instead of as a wall of pg module-not-found errors.
import "server-only";

import { db } from "@/lib/db";
import { awardPoints, ensureLoyaltyAccount } from "@/lib/points/ledger";
import { REFERRAL_REWARD_POINTS, REFERRED_BONUS_POINTS, MAX_REWARDED_REFERRALS, SIGNUP_BONUS_POINTS } from "@/lib/points/rules";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";

/**
 * Credits a new account's joining points, LOCKED until their first payment.
 * Called from the Better Auth user-create hook. Idempotent.
 */
export async function grantJoiningBonus(args: { userId: string; referralCode?: string | null }) {
  await ensureLoyaltyAccount(args.userId);

  await awardPoints({
    userId: args.userId,
    lockedDelta: SIGNUP_BONUS_POINTS,
    reason: "SIGNUP_BONUS",
    refType: "signup",
    refId: args.userId,
  });

  if (args.referralCode) await attachReferral({ userId: args.userId, code: args.referralCode });
}

export type AttachResult =
  | { attached: true; bonusPoints: number }
  | { attached: false; reason: "UNKNOWN_CODE" | "SELF_REFERRAL" | "ALREADY_REFERRED" | "CAP_REACHED" | "NOT_NEW" };

/**
 * Links a new customer to whoever referred them and credits their LOCKED
 * welcome bonus. Separate from grantJoiningBonus because Better Auth's
 * user-create hook never sees the request body, so the code arrives from the
 * signup UI a moment later.
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

  await awardPoints({
    userId: args.userId,
    lockedDelta: REFERRED_BONUS_POINTS,
    reason: "REFERRED_BONUS",
    refType: "referral",
    refId: referrer.userId,
  });

  return { attached: true, bonusPoints: REFERRED_BONUS_POINTS };
}

export type ReferralConversion = {
  converted: boolean;
  referrerUserId: string | null;
  referrerPoints: number;
  /** Locked bonus the referred customer carries; unlocked separately. */
  referredPoints: number;
};

/**
 * Marks a referral converted on the referred customer's first paid order and
 * pays the referrer. No-op on their second and later orders.
 */
export async function convertReferral(args: {
  userId: string;
  orderId: string;
}): Promise<ReferralConversion> {
  const none: ReferralConversion = {
    converted: false,
    referrerUserId: null,
    referrerPoints: 0,
    referredPoints: 0,
  };

  const referral = await db.referral.findUnique({
    where: { referredUserId: args.userId },
    select: { id: true, referrerUserId: true, convertedAt: true },
  });
  if (!referral || referral.convertedAt) return none;

  const rewarded = await db.referral.count({
    where: { referrerUserId: referral.referrerUserId, rewardedAt: { not: null } },
  });
  const withinCap = rewarded < MAX_REWARDED_REFERRALS;

  const entry = withinCap
    ? await awardPoints({
        userId: referral.referrerUserId,
        delta: REFERRAL_REWARD_POINTS,
        reason: "REFERRAL_REWARD",
        refType: "referral",
        refId: args.userId,
      })
    : null;

  await db.referral.update({
    where: { id: referral.id },
    data: { convertedAt: new Date(), rewardedAt: entry ? new Date() : null },
  });

  if (entry) await notifyReferrer(referral.referrerUserId, REFERRAL_REWARD_POINTS);

  return {
    converted: true,
    referrerUserId: referral.referrerUserId,
    referrerPoints: entry ? REFERRAL_REWARD_POINTS : 0,
    referredPoints: 0,
  };
}

async function notifyReferrer(referrerUserId: string, points: number) {
  const msg = `Someone you invited just made their first Fechi Organics order — you earned ${points.toLocaleString()} points.`;

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
