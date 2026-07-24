import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

// ---------------------------------------------------------------------------
// GET /api/admin/customers/[id]
// Returns a single user with order count and loyalty points.
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
    return Err.internal(e);
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
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { customers: ["update"] });
    if (denied) return denied;

    const { id } = await params;

    const session = await auth.api.getSession({ headers: await headers() });
    if (id === session?.user.id) {
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
    return Err.internal(e);
  }
}
