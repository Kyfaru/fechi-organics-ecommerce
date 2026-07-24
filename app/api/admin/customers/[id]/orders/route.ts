import { db } from "@/lib/db";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";

// ---------------------------------------------------------------------------
// GET /api/admin/customers/[id]/orders
// Returns the customer's orders, newest first, with item count.
// Capped at 50 — cursor pagination can be added when needed.
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const denied = await requirePermission(req, { customers: ["view"] });
    if (denied) return denied;

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
    return Err.internal(e);
  }
}
