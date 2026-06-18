import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/customers/[id]
// Returns a single user with order count and loyalty points.
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

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        country: true,
        city: true,
        role: true,
        banned: true,
        banReason: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true } },
        loyaltyPoints: {
          select: { points: true, tier: true, updatedAt: true },
        },
      },
    });

    if (!user) return Err.notFound("Customer");

    return ok({ user });
  } catch (e) {
    console.error("[admin/customers/[id]] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/customers/[id]
// Body: { banned?: boolean, banReason?: string }
// Admins cannot ban themselves.
// ---------------------------------------------------------------------------
const PatchSchema = z.object({
  banned: z.boolean().optional(),
  banReason: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { id } = await params;

    if (id === admin.id) {
      return Err.validation("You cannot modify your own account this way");
    }

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const user = await db.user.update({
      where: { id },
      data: parsed.data,
      select: { id: true, banned: true, banReason: true, role: true },
    });

    console.info("[admin/customers/[id]] PATCH — updated", user.id);
    return ok({ user });
  } catch (e) {
    console.error("[admin/customers/[id]] PATCH error", e);
    return Err.internal();
  }
}
