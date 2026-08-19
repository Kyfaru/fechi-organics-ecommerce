/**
 * GET /api/admin/loyalty/ledger/[userId]
 *
 * One customer's full points history, plus a live integrity check of their
 * chain. Read-only — there is no endpoint anywhere that edits a ledger entry.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { verifyChain, CENTS_PER_POINT } from "@/lib/points/ledger";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  await connection();
  try {
    const denied = await requirePermission(req, { loyalty: ["view"] });
    if (denied) return denied;

    const { userId } = await ctx.params;

    const [loyalty, entries, integrity, badges] = await Promise.all([
      db.loyaltyPoints.findUnique({
        where: { userId },
        select: {
          userCode: true,
          points: true,
          lockedPoints: true,
          lifetimeEarned: true,
          lifetimeRedeemed: true,
          level: true,
          badgeCount: true,
          user: { select: { name: true, email: true } },
        },
      }),
      db.pointsLedger.findMany({
        where: { userId },
        orderBy: { seq: "desc" },
        take: 500,
        select: {
          id: true,
          seq: true,
          delta: true,
          lockedDelta: true,
          balanceAfter: true,
          lockedAfter: true,
          reason: true,
          refType: true,
          refId: true,
          createdAt: true,
        },
      }),
      verifyChain(userId),
      db.userBadge.findMany({
        where: { userId },
        orderBy: { earnedAt: "desc" },
        take: 100,
        select: { badgeId: true, earnedAt: true, grantedByAdminProfileId: true },
      }),
    ]);

    if (!loyalty) return Err.notFound("Loyalty account");

    return ok({
      customer: {
        userCode: loyalty.userCode,
        name: loyalty.user?.name ?? "—",
        email: loyalty.user?.email ?? "—",
        points: loyalty.points,
        lockedPoints: loyalty.lockedPoints,
        lifetimeEarned: loyalty.lifetimeEarned,
        lifetimeRedeemed: loyalty.lifetimeRedeemed,
        level: loyalty.level,
        badgeCount: loyalty.badgeCount,
        cashValueCents: loyalty.points * CENTS_PER_POINT,
      },
      // ok:false here means somebody edited the table directly. Investigate
      // before adjusting anything — the chain is the evidence.
      integrity,
      entries,
      badges,
    });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/loyalty/ledger/[userId]", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
