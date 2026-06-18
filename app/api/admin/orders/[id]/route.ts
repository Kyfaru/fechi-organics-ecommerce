import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/orders/[id]
// Returns full order detail with user, items (with product thumbnails)
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { objectKey: true },
                },
              },
            },
          },
        },
      },
    });

    if (!order) return Err.notFound("Order");

    console.info("[admin/orders/[id]] GET —", id);
    return ok({ order });
  } catch (e) {
    console.error("[admin/orders/[id]] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/[id]
// Update order status
// ---------------------------------------------------------------------------
const UpdateOrderSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED"]).optional(),
});

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
    if (!parsed.data.status && !parsed.data.paymentStatus) {
      return Err.validation("Provide at least one field to update (status or paymentStatus)");
    }

    const order = await db.order.findUnique({ where: { id } });
    if (!order) return Err.notFound("Order");

    const updated = await db.order.update({
      where: { id },
      data: parsed.data,
      include: {
        user: { select: { name: true, email: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: { where: { isPrimary: true }, take: 1, select: { objectKey: true } },
              },
            },
          },
        },
      },
    });

    console.info("[admin/orders/[id]] PATCH —", id, "status →", parsed.data.status);
    return ok({ order: updated });
  } catch (e) {
    console.error("[admin/orders/[id]] PATCH error", e);
    return Err.internal();
  }
}
