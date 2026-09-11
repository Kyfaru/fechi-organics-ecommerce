/**
 * GET /api/account/achievements
 *
 * Everything the rewards page needs in one round trip: balance, spend stats,
 * and the customer's referral code/progress.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { ensureLoyaltyAccount, getBalance, CENTS_PER_POINT } from "@/lib/points/ledger";
import { getUserStats } from "@/lib/points/stats";
import { MAX_REWARDED_REFERRALS } from "@/lib/points/rules";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();
    const userId = session.user.id;

    const loyalty = await ensureLoyaltyAccount(userId);

    const [balance, stats, referrals] = await Promise.all([
      getBalance(userId),
      getUserStats(userId),
      db.referral.findMany({
        where: { referrerUserId: userId },
        select: { convertedAt: true, rewardedAt: true, createdAt: true },
      }),
    ]);

    return ok({
      userCode: loyalty.userCode,
      referralCode: loyalty.referralCode,
      referralsUsed: referrals.filter((r) => r.rewardedAt).length,
      referralsRemaining: Math.max(0, MAX_REWARDED_REFERRALS - referrals.filter((r) => r.rewardedAt).length),
      referralsPending: referrals.filter((r) => !r.convertedAt).length,
      leaderboardPublic: loyalty.leaderboardPublic,
      points: {
        available: balance.available,
        locked: balance.locked,
        lifetimeEarned: balance.lifetimeEarned,
        lifetimeRedeemed: balance.lifetimeRedeemed,
        centsPerPoint: CENTS_PER_POINT,
        cashValueCents: balance.available * CENTS_PER_POINT,
      },
      stats: {
        lifetimeSpendCents: stats.lifetimeSpendCents,
        largestOrderCents: stats.largestOrderCents,
      },
    });
  } catch (e) {
    reportError(e, { route: "GET /api/account/achievements", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
