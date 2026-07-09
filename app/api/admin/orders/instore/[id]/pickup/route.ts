import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";

// ---------------------------------------------------------------------------
// Auth helper — matches pattern in /api/admin/orders/route.ts
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  return user?.role === "admin" ? user : null;
}

// ---------------------------------------------------------------------------
// POST /api/admin/orders/instore/[id]/pickup
// Marks an in-store order as picked up — the only fulfillment transition
// in-store orders have (CONFIRMED -> PICKED_UP). Requires the order to
// already be paid, and rejects a repeat call explicitly (idempotency guard
// against double-clicks) rather than silently no-op'ing.
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const order = await db.inStoreOrder.findUnique({ where: { id } });
    if (!order) return Err.notFound("Order");

    // Branch-scoped admins may only manage their own branch's in-store
    // orders — same rule as the regular order fulfillment routes.
    if (!admin.adminProfile?.isSuperAdmin && admin.adminProfile?.branchId !== order.branchId) {
      return Err.forbidden();
    }

    if (order.paymentStatus !== "PAID") {
      return err("NOT_PAID", "Order is not paid", 400);
    }
    if (order.fulfillmentStatus !== "CONFIRMED") {
      return err("ALREADY_PICKED_UP", "Order already marked picked up", 400);
    }

    await db.inStoreOrder.update({
      where: { id },
      data: { fulfillmentStatus: "PICKED_UP", pickedUpAt: new Date() },
    });

    console.info("[admin/orders/instore/[id]/pickup] POST —", id);
    return ok({});
  } catch (e) {
    console.error("[admin/orders/instore/[id]/pickup] POST error", e);
    return Err.internal();
  }
}
