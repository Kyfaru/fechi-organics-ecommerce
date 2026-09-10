import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { logActivity } from "@/lib/admin-activity";
import { reportError } from "@/lib/observability";

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

    // Combined online + successful in-store order count under the same
    // `_count.orders` key the client already reads. inStoreOrder.customerUserId
    // is a plain string field with no back-relation declared on `user` (see
    // lib/customers/find-or-create-walkin.ts's "best-effort, not DB-enforced"
    // comment), so this can't be a nested Prisma _count — a separate count is required.
    const inStoreOrderCount = await db.inStoreOrder.count({
      where: { customerUserId: id, paymentStatus: "PAID" },
    });
    const shaped = { ...user, _count: { orders: user._count.orders + inStoreOrderCount } };

    return ok({ user: shaped });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/customers/[id]", tags: { domain: "customers" } });
    console.error("[admin/customers/[id]] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/customers/[id]
// Body: { banned?, banReason?, name?, phone?, email? }
// name/phone/email exist mainly to let an admin fill in the real email for a
// walk-in customer created with a placeholder (see lib/customers/find-or-create-walkin.ts).
// Admins cannot ban themselves.
// ---------------------------------------------------------------------------
const PatchSchema = z.object({
  banned: z.boolean().optional(),
  banReason: z.string().max(500).optional(),
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(9).max(20).optional(),
  email: z.string().email().optional(),
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

    const before = await db.user.findUnique({ where: { id }, select: { name: true, email: true, phone: true } });
    if (!before) return Err.notFound("Customer");

    if (parsed.data.email) {
      const emailTaken = await db.user.findFirst({
        where: { email: parsed.data.email, id: { not: id } },
        select: { id: true },
      });
      if (emailTaken) return Err.validation("That email is already in use by another account");
    }

    const user = await db.user.update({
      where: { id },
      data: parsed.data,
      select: { id: true, name: true, email: true, phone: true, banned: true, banReason: true, role: true },
    });

    const changedFields = (["name", "phone", "email"] as const).filter(
      (f) => parsed.data[f] !== undefined && parsed.data[f] !== before[f],
    );
    if (changedFields.length > 0) {
      const caller = await loadCallerContext();
      if (!caller.denied) {
        logActivity(caller.id, `Updated customer ${user.name} (${changedFields.join(", ")})`, "customer", id, req, {
          changes: Object.fromEntries(changedFields.map((f) => [f, { from: before[f], to: parsed.data[f] }])),
        }, "WARNING");
      }
    }

    console.info("[admin/customers/[id]] PATCH — updated", user.id);
    return ok({ user });
  } catch (e) {
    reportError(e, { route: "PATCH /api/admin/customers/[id]", tags: { domain: "customers" } });
    console.error("[admin/customers/[id]] PATCH error", e);
    return Err.internal();
  }
}
