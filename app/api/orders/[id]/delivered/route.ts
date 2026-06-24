import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { headers } from "next/headers";

/**
 * POST /api/orders/[id]/delivered
 * Lets the authenticated customer mark their own SHIPPED order as DELIVERED.
 * Guards: must be the order owner; order must be in SHIPPED status.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Err.authRequired();

    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });

    if (!order || order.userId !== session.user.id) return Err.notFound("Order");
    if (order.status !== "SHIPPED") {
      return Err.validation("Order is not in SHIPPED status");
    }

    await db.order.update({ where: { id }, data: { status: "DELIVERED" } });

    console.info("[orders/[id]/delivered] Marked delivered — order", id, "user", session.user.id);
    return ok({ ok: true });
  } catch (e) {
    console.error("[orders/[id]/delivered] POST error", e);
    return Err.internal();
  }
}
