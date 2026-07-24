import { db } from "@/lib/db";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";

/**
 * GET /api/admin/customers/[id]/stats — testimonials given, lifetime spend,
 * and channel-usage breakdown (from CampaignRecipient — reflects bulk
 * campaign sends this customer has received, not one-off outreach messages)
 * for the customer drawer's engagement section.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const denied = await requirePermission(req, { customers: ["view"] });
    if (denied) return denied;

    const { id } = await params;

    const [testimonialsCount, spendResult, channelGroups] = await Promise.all([
      db.testimonial.count({ where: { userId: id } }),
      db.order.aggregate({
        where: { userId: id, paymentStatus: "PAID" },
        _sum: { totalKes: true },
      }),
      db.campaignRecipient.groupBy({
        by: ["channel"],
        where: { userId: id, status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] } },
        _count: { _all: true },
      }),
    ]);

    return ok({
      testimonialsCount,
      totalSpendKes: spendResult._sum.totalKes ?? 0,
      channelUsage: channelGroups.map((g) => ({ channel: g.channel, count: g._count._all })),
    });
  } catch (e) {
    console.error("[admin/customers/[id]/stats] GET error", e);
    return Err.internal(e);
  }
}
