/**
 * GET /api/admin/promotions/[id]/redemptions
 *
 * Who has used this coupon. Powers the usage list in the customer-coupon view
 * drawer, where each row links through to that customer's detail drawer.
 *
 * `promotion` lives in the `admin` Postgres schema and `couponRedemption` /
 * `user` in `public`, with no foreign keys between them — so this is three
 * queries joined in code rather than a Prisma include.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await connection();

  const denied = await requirePermission(req, { promotions: ["view"] });
  if (denied) return denied;

  const { id } = await ctx.params;

  try {
    const promotion = await db.promotion.findUnique({ where: { id } });
    if (!promotion) return Err.notFound("Promotion");

    const redemptions = await db.couponRedemption.findMany({
      where: { couponId: id },
      orderBy: { redeemedAt: "desc" },
      take: 200,
    });

    const userIds = [...new Set(redemptions.map((r) => r.userId))];
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, image: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const owner = promotion.ownerUserId
      ? await db.user.findUnique({
          where: { id: promotion.ownerUserId },
          select: { id: true, name: true, email: true, image: true },
        })
      : null;

    return ok({
      promotion: { ...promotion, owner },
      redemptions: redemptions.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        redeemedAt: r.redeemedAt,
        customer: userById.get(r.userId) ?? { id: r.userId, name: null, email: null, image: null },
      })),
    });
  } catch (e) {
    reportError(e, {
      route: "GET /api/admin/promotions/[id]/redemptions",
      extra: { promotionId: id },
    });
    return Err.internal();
  }
}
