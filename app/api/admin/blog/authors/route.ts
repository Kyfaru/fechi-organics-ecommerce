/**
 * GET  /api/admin/blog/authors — list staff eligible to be credited as a
 *   blog author. Deliberately gated on `content:view` (not `staff:view`,
 *   which /api/admin/staff requires) — a marketing/customer_care admin can
 *   write blog posts but has no `staff` grant at all (lib/permissions.ts),
 *   so the author picker was silently returning zero options for them.
 * POST /api/admin/blog/authors — create a lightweight, no-login "author"
 *   account for crediting someone who isn't a real staff member. No
 *   credential `account` row is created, so it can never sign in.
 */
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { roles, type RoleName } from "@/lib/permissions";
import { reportError } from "@/lib/observability";

function isEligibleAuthor(banned: boolean, role: string | undefined, isSuperAdmin: boolean | undefined): boolean {
  if (banned) return false;
  if (isSuperAdmin) return true;
  const r = roles[role as RoleName];
  return Boolean(r?.authorize({ content: ["view"] })?.success);
}

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { content: ["view"] });
  if (denied) return denied;

  try {
    const staff = await db.user.findMany({
      where: { role: "admin" },
      select: {
        id: true,
        name: true,
        email: true,
        banned: true,
        adminProfile: { select: { role: true, isSuperAdmin: true } },
      },
      orderBy: { name: "asc" },
    });

    const authors = staff
      .filter((s) => isEligibleAuthor(s.banned, s.adminProfile?.role, s.adminProfile?.isSuperAdmin))
      .map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        adminProfile: s.adminProfile ? { role: s.adminProfile.role } : null,
      }));

    return ok({ authors });
  } catch (e) {
    console.error("[admin/blog/authors] GET error", e);
    reportError(e, { route: "GET /api/admin/blog/authors" });
    return Err.internal();
  }
}

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "author";
}

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { content: ["update"] });
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";
    if (rawName.length < 2) return Err.validation("Name must be at least 2 characters");

    const displayName = rawName.toUpperCase();
    const userId = crypto.randomUUID();
    // No credential account row is ever created for this user, so a real
    // (globally unique) email is required by the schema but nothing ever
    // sends to it or authenticates with it.
    const syntheticEmail = `author-${slugifyName(rawName)}-${userId.slice(0, 8)}@authors.internal`;

    await db.$transaction([
      db.user.create({
        data: {
          id: userId,
          name: displayName,
          email: syntheticEmail,
          emailVerified: false,
          role: "admin",
        },
      }),
      db.adminProfile.create({
        data: {
          userId,
          fullName: displayName,
          // content:view-only role — these accounts can never log in (no
          // credential account), so this only controls whether they show up
          // in author pickers elsewhere, not any real access.
          role: "customer_care",
          isSuperAdmin: false,
          isActive: true,
        },
      }),
    ]);

    return created({ author: { id: userId, name: displayName, email: syntheticEmail, adminProfile: { role: "customer_care" } } });
  } catch (e) {
    console.error("[admin/blog/authors] POST error", e);
    reportError(e, { route: "POST /api/admin/blog/authors" });
    return Err.internal();
  }
}
