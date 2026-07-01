import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/customers
// Query params: search (name/email), status (all|active|banned), sort (newest|name|orders)
// Returns all users with order counts and loyalty tier.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status") ?? "all";
    const sort = searchParams.get("sort") ?? "newest";

    const where: Record<string, unknown> = { role: "client" };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "banned") where.banned = true;
    if (status === "active") where.banned = false;

    const orderBy =
      sort === "name"
        ? { name: "asc" as const }
        : { createdAt: "desc" as const };

    const users = await db.user.findMany({
      where,
      orderBy,
      take: 200,
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        phone: true,
        country: true,
        city: true,
        role: true,
        banned: true,
        banReason: true,
        createdAt: true,
        loginCount: true,
        _count: { select: { orders: true } },
        loyaltyPoints: { select: { tier: true } },
      },
    });

    // Derive stats on the fetched set (always unfiltered for stat cards)
    const allUsers = await db.user.findMany({
      select: { banned: true, createdAt: true },
      take: 10000,
    });

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Active = not banned and joined within last 90 days (simplest proxy)
    const stats = {
      total: allUsers.length,
      active: allUsers.filter(
        (u) => !u.banned && u.createdAt >= ninetyDaysAgo
      ).length,
      newThisMonth: allUsers.filter((u) => u.createdAt >= monthStart).length,
      banned: allUsers.filter((u) => u.banned).length,
    };

    console.info("[admin/customers] GET — returned", users.length, "users");
    return ok({ users, stats });
  } catch (e) {
    console.error("[admin/customers] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/customers
// Body: { id, role } — kept for backward compat with existing role toggle
// ---------------------------------------------------------------------------
const RoleSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["client", "admin"]),
}).strict();

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = RoleSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    if (parsed.data.id === admin.id && parsed.data.role === "client") {
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
