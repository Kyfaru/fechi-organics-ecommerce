import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import type { RoleName, statements } from "@/lib/permissions";

type Statements = typeof statements;
export type PermissionCheck = Partial<{ [K in keyof Statements]: Statements[K][number][] }>;

type CallerContext =
  | { denied: "auth" | "inactive" | "expired" }
  | { denied?: undefined; role: RoleName; isSuperAdmin: boolean };

async function loadCallerContext(): Promise<CallerContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { denied: "auth" };

  const profile = await db.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: { role: true, isSuperAdmin: true, isActive: true, accessExpiresAt: true },
  });
  if (!profile?.isActive) return { denied: "inactive" };
  if (profile.accessExpiresAt && profile.accessExpiresAt < new Date()) return { denied: "expired" };

  return { role: profile.role as RoleName, isSuperAdmin: profile.isSuperAdmin };
}

/**
 * Guards an admin API route by resource/action permission.
 *
 * Returns null when access is granted (caller should continue), or a
 * NextResponse to return immediately when denied. Same calling convention as
 * the legacy `requireAdminPage(req, page)` it replaces:
 *   const denied = await requirePermission(req, { staff: ["view"] });
 *   if (denied) return denied;
 */
export async function requirePermission(
  _req: NextRequest,
  permissions: PermissionCheck,
): Promise<Response | null> {
  const ctx = await loadCallerContext();
  if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
  if (ctx.isSuperAdmin) return null;

  const result = await auth.api.userHasPermission({
    headers: await headers(),
    body: { role: ctx.role, permissions },
  });
  return result.success ? null : Err.forbidden();
}

/** Server-component page variant — redirects instead of returning a response. */
export async function requirePermissionPage(permissions: PermissionCheck): Promise<void> {
  const ctx = await loadCallerContext();
  if (ctx.denied) redirect(ctx.denied === "auth" ? "/admin/login" : "/admin");
  if (ctx.isSuperAdmin) return;

  const result = await auth.api.userHasPermission({
    headers: await headers(),
    body: { role: ctx.role, permissions },
  });
  if (!result.success) redirect("/admin");
}

/**
 * Session-only gate for self-service routes (profile, 2FA, password
 * management) that every role must keep access to — no resource/action
 * check, just auth + active + not-expired.
 */
export async function requireStaffSession(
  _req?: NextRequest,
): Promise<Response | null> {
  const ctx = await loadCallerContext();
  if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
  return null;
}
