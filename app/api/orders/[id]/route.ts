import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

// ---------------------------------------------------------------------------
// GET /api/orders/[id] — authenticated user, owns the order
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: { select: { name: true } } },
        },
        branch: { select: { name: true, county: true, phone: true } },
        transactions: true,
        statusEvents: { orderBy: { occurredAt: "asc" } },
      },
    });

    if (!order) return Err.notFound("Order");

    // Prevent cross-user access
    if (order.userId !== session.user.id) return Err.forbidden();

    return ok({ order });
  } catch (e) {
    console.error("[orders/[id]] GET error", e);
    return Err.internal(e);
  }
}
