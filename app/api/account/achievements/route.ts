/**
 * GET /api/account/achievements
 *
 * Everything the achievements page needs in one round trip: balance, level,
 * the full badge grid with locked/unlocked state and progress toward each
 * next tier, and the customer's referral code.
 *
 * Hidden badges (tiers far beyond reach) are only included once the customer
 * is within sight of them, so the grid stays a goal list rather than a wall.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { ensureLoyaltyAccount, getBalance, CENTS_PER_POINT } from "@/lib/points/ledger";
import { levelProgress } from "@/lib/points/levels";
import { getUserStats } from "@/lib/points/stats";
import { MAX_REWARDED_REFERRALS } from "@/lib/points/rules";
import type { StatKey } from "@/lib/points/badge-families";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();
    const userId = session.user.id;

    const loyalty = await ensureLoyaltyAccount(userId);

    const [balance, stats, earned, catalog, referrals] = await Promise.all([
      getBalance(userId),
      getUserStats(userId),
      db.userBadge.findMany({ where: { userId }, select: { badgeId: true, earnedAt: true } }),
      db.badge.findMany({ orderBy: { sortOrder: "asc" } }),
      db.referral.findMany({
        where: { referrerUserId: userId },
        select: { convertedAt: true, rewardedAt: true, createdAt: true },
      }),
    ]);

    const earnedMap = new Map(earned.map((e) => [e.badgeId, e.earnedAt]));

    const badges = catalog
      .map((b) => {
        const earnedAt = earnedMap.get(b.id) ?? null;
        const current =
          b.ruleKey && typeof stats[b.ruleKey as StatKey] === "number"
            ? (stats[b.ruleKey as StatKey] as number)
            : null;
        // threshold is BigInt in the database (top tiers exceed int32) and
        // BigInt cannot be JSON-serialised — convert once, here. Every value
        // is under 2^53 so this is lossless.
        const threshold = b.threshold === null ? null : Number(b.threshold);
        const percent =
          earnedAt || threshold === null || threshold === 0 || current === null
            ? earnedAt
              ? 100
              : 0
            : Math.min(100, Math.round((current / threshold) * 100));

        return {
          id: b.id,
          familyKey: b.familyKey,
          tier: b.tier,
          name: b.name,
          description: b.description,
          icon: b.icon,
          rarity: b.rarity,
          points: b.points,
          grantType: b.grantType,
          threshold,
          current,
          percent,
          earned: earnedAt !== null,
          earnedAt,
          hidden: b.hidden,
        };
      })
      // A hidden tier only appears once it is at least a quarter reached.
      .filter((b) => b.earned || !b.hidden || b.percent >= 25);

    const progress = levelProgress(earned.length);

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
      level: progress,
      badgeCount: earned.length,
      totalBadges: catalog.length,
      stats: {
        paidOrders: stats.paidOrders,
        lifetimeSpendCents: stats.lifetimeSpendCents,
        longestWeekStreak: stats.longestWeekStreak,
        referralsConverted: stats.referralsConverted,
      },
      badges,
    });
  } catch (e) {
    reportError(e, { route: "GET /api/account/achievements", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
