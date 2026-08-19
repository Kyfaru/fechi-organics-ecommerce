/**
 * GET /api/admin/loyalty — programme overview and the member list.
 *
 * Strictly read-only. Admins can see every balance but can never change one:
 * the sole write path is the unanimous super-admin grant flow, and the ledger
 * itself is append-only at the database (prisma/sql/points-ledger-guard.sql).
 * There is deliberately no PATCH here.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { CENTS_PER_POINT } from "@/lib/points/ledger";
import { reportError } from "@/lib/observability";

const PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { loyalty: ["view"] });
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";

    const where = search
      ? {
          OR: [
            { userCode: { contains: search, mode: "insensitive" as const } },
            { user: { name: { contains: search, mode: "insensitive" as const } } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const [members, totals, redeemedOnline, redeemedInStore, openFlags, pendingGrants] =
      await Promise.all([
        db.loyaltyPoints.findMany({
          where,
          orderBy: { lifetimeEarned: "desc" },
          take: PAGE_SIZE,
          select: {
            userId: true,
            userCode: true,
            points: true,
            lockedPoints: true,
            lifetimeEarned: true,
            lifetimeRedeemed: true,
            level: true,
            badgeCount: true,
            leaderboardPublic: true,
            updatedAt: true,
            user: { select: { name: true, email: true, image: true } },
          },
        }),
        db.loyaltyPoints.aggregate({
          _sum: { points: true, lockedPoints: true, lifetimeEarned: true, lifetimeRedeemed: true },
          _count: true,
        }),
        db.order.aggregate({
          where: { paymentStatus: "PAID", pointsRedeemed: { gt: 0 } },
          _sum: { pointsRedeemed: true, pointsDiscountKes: true },
          _count: true,
        }),
        db.inStoreOrder.aggregate({
          where: { paymentStatus: "PAID", pointsRedeemed: { gt: 0 } },
          _sum: { pointsRedeemed: true, pointsDiscountKes: true },
          _count: true,
        }),
        db.pointsAbuseFlag.count({ where: { reviewedAt: null } }),
        db.pointsGrantRequest.count({ where: { status: "PENDING" } }),
      ]);

    const outstanding = totals._sum.points ?? 0;

    return ok({
      centsPerPoint: CENTS_PER_POINT,
      summary: {
        members: totals._count,
        outstandingPoints: outstanding,
        // What the outstanding balance would cost if every customer spent it.
        outstandingLiabilityCents: outstanding * CENTS_PER_POINT,
        lockedPoints: totals._sum.lockedPoints ?? 0,
        lifetimeEarned: totals._sum.lifetimeEarned ?? 0,
        lifetimeRedeemed: totals._sum.lifetimeRedeemed ?? 0,
        ordersPaidWithPoints: redeemedOnline._count + redeemedInStore._count,
        pointsUtilised:
          (redeemedOnline._sum.pointsRedeemed ?? 0) + (redeemedInStore._sum.pointsRedeemed ?? 0),
        pointsUtilisedValueCents:
          (redeemedOnline._sum.pointsDiscountKes ?? 0) + (redeemedInStore._sum.pointsDiscountKes ?? 0),
        openFlags,
        pendingGrants,
      },
      members: members.map((m) => ({
        userId: m.userId,
        userCode: m.userCode,
        name: m.user?.name ?? "—",
        email: m.user?.email ?? "—",
        image: m.user?.image ?? null,
        points: m.points,
        lockedPoints: m.lockedPoints,
        lifetimeEarned: m.lifetimeEarned,
        lifetimeRedeemed: m.lifetimeRedeemed,
        level: m.level,
        badgeCount: m.badgeCount,
        leaderboardPublic: m.leaderboardPublic,
        updatedAt: m.updatedAt,
      })),
    });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/loyalty", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
