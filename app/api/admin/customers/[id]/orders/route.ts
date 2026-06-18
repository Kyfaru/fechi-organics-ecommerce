import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { NextRequest } from "next/server";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/customers/[id]/orders
// Returns the customer's orders, newest first, with item count.
// Capped at 50 — cursor pagination can be added when needed.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const orders = await db.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        totalKes: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    });

    return ok({ orders });
  } catch (e) {
    console.error("[admin/customers/[id]/orders] GET error", e);
    return Err.internal();
  }
}
