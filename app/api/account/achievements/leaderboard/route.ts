/**
 * GET /api/account/achievements/leaderboard
 *
 * Ranks every customer by lifetime points earned — not spendable balance, so
 * redeeming your points never costs you your position.
 *
 * Privacy: everyone is ranked, but a customer's name and photo only appear if
 * they opted in (loyaltyPoints.leaderboardPublic). Everyone else shows as
 * their opaque user code. Kenya's Data Protection Act treats a purchase-derived
 * public ranking as publishing personal data, so opt-out is not enough.
 *
 * The caller always sees their own row unmasked, including their true rank
 * even when it falls outside the returned page.
 *
 * PATCH toggles the caller's own opt-in.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { levelForBadgeCount } from "@/lib/points/levels";
import { reportError } from "@/lib/observability";

const TOP_N = 50;

export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();
    const userId = session.user.id;

    const rows = await db.loyaltyPoints.findMany({
      where: { lifetimeEarned: { gt: 0 } },
      orderBy: [{ lifetimeEarned: "desc" }, { createdAt: "asc" }],
      take: TOP_N,
      select: {
        userId: true,
        userCode: true,
        lifetimeEarned: true,
        badgeCount: true,
        leaderboardPublic: true,
        user: { select: { name: true, username: true, image: true } },
      },
    });

    const board = rows.map((r, i) => {
      const isSelf = r.userId === userId;
      const reveal = r.leaderboardPublic || isSelf;
      return {
        rank: i + 1,
        isSelf,
        userCode: r.userCode,
        displayName: reveal ? (r.user?.username ?? r.user?.name ?? r.userCode) : r.userCode,
        image: reveal ? r.user?.image ?? null : null,
        points: r.lifetimeEarned,
        badgeCount: r.badgeCount,
        level: levelForBadgeCount(r.badgeCount),
      };
    });

    // The caller's true standing, even when they are nowhere near the top.
    const me = await db.loyaltyPoints.findUnique({
      where: { userId },
      select: { userCode: true, lifetimeEarned: true, badgeCount: true, leaderboardPublic: true },
    });

    let myRank: number | null = null;
    if (me && me.lifetimeEarned > 0) {
      myRank =
        (await db.loyaltyPoints.count({ where: { lifetimeEarned: { gt: me.lifetimeEarned } } })) + 1;
    }

    return ok({
      board,
      me: me
        ? {
            rank: myRank,
            userCode: me.userCode,
            points: me.lifetimeEarned,
            badgeCount: me.badgeCount,
            level: levelForBadgeCount(me.badgeCount),
            leaderboardPublic: me.leaderboardPublic,
            inTopN: board.some((b) => b.isSelf),
          }
        : null,
    });
  } catch (e) {
    reportError(e, { route: "GET /api/account/achievements/leaderboard", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}

const patchSchema = z.object({ leaderboardPublic: z.boolean() }).strict();

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Err.validation("leaderboardPublic must be a boolean");

    // updateMany, not update — a customer with no loyalty row yet has nothing
    // to reveal and should not 500 on the toggle.
    await db.loyaltyPoints.updateMany({
      where: { userId: session.user.id },
      data: { leaderboardPublic: parsed.data.leaderboardPublic },
    });

    return ok({ leaderboardPublic: parsed.data.leaderboardPublic });
  } catch (e) {
    reportError(e, { route: "PATCH /api/account/achievements/leaderboard", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
