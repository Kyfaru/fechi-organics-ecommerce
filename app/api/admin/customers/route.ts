import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Auth helper — resolves the calling user and confirms they are an admin.
// Returns the user record on success, null otherwise.
// ---------------------------------------------------------------------------
async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/customers
// Returns all users (safe fields only), newest first.
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        phone: true,
        country: true,
        role: true,
        createdAt: true,
        loginCount: true,
      },
    });

    console.info("[admin/customers] GET — returned", users.length, "users");
    return ok({ users });
  } catch (e) {
    console.error("[admin/customers] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/customers
// Body: { id: uuid, role: "customer" | "admin" }
// Updates a single user's role. Admins cannot demote themselves.
// ---------------------------------------------------------------------------
const RoleSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["customer", "admin"]),
});

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = RoleSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    // Prevent an admin from accidentally demoting themselves
    if (parsed.data.id === admin.id && parsed.data.role === "customer") {
      return Err.validation("You cannot demote your own account");
    }

    const user = await db.user.update({
      where: { id: parsed.data.id },
      data: { role: parsed.data.role },
      select: { id: true, role: true },
    });

    console.info("[admin/customers] PATCH — updated role for", user.id, "->", user.role);
    return ok({ user });
  } catch (e) {
    console.error("[admin/customers] PATCH error", e);
    return Err.internal();
  }
}
