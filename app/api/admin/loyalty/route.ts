import { db } from "@/lib/db";
import { connection, NextRequest } from "next/server";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";

// ---------------------------------------------------------------------------
// GET /api/admin/loyalty
// Returns tier definitions and top 50 customers ranked by points.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { loyalty: ["view"] });
    if (denied) return denied;

    const [tiers, topCustomers] = await Promise.all([
      db.loyaltyTier.findMany({ orderBy: { minSpend: "asc" } }),
      db.loyaltyPoints.findMany({
        take: 50,
        orderBy: { points: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              _count: { select: { orders: true } },
            },
          },
        },
      }),
    ]);

    return ok({ tiers, topCustomers });
  } catch (e) {
    console.error("[admin/loyalty] GET error", e);
    return Err.internal(e);
  }
}
