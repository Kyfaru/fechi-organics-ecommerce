import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

// ---------------------------------------------------------------------------
// Auth helper — mirrors app/api/admin/products/route.ts
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/orders — admin only, returns 50 most recent orders
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const orders = await db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { name: true, email: true } },
        items: { select: { name: true, quantity: true, priceKes: true } },
      },
    });

    console.info("[admin/orders] GET — returned", orders.length, "orders");
    return ok({ orders });
  } catch (e) {
    console.error("[admin/orders] GET error", e);
    return Err.internal();
  }
}
