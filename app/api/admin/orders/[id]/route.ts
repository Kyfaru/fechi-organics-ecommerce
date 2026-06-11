import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
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

const UpdateOrderSchema = z.object({
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ]),
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/[id] — admin only, update order status
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateOrderSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const order = await db.order.findUnique({ where: { id } });
    if (!order) return Err.notFound("Order");

    const updated = await db.order.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    console.info("[admin/orders/[id]] PATCH — updated order", id, "status →", parsed.data.status);
    return ok({ order: updated });
  } catch (e) {
    console.error("[admin/orders/[id]] PATCH error", e);
    return Err.internal();
  }
}
