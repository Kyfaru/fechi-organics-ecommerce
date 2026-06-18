import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/loyalty
// Returns tier definitions and top 50 customers ranked by points.
// ---------------------------------------------------------------------------
export async function GET() {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

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
    return Err.internal();
  }
}
