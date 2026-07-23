import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import type { RoleName, statements } from "@/lib/permissions";

type Statements = typeof statements;
export type PermissionCheck = Partial<{ [K in keyof Statements]: Statements[K][number][] }>;

/** Shape stored in adminProfile.permissions — a per-staff-member narrowing
 * override. Can only turn resources OFF relative to what the role grants;
 * there is no allow-list — a role's grants are always the ceiling. */
export type PermissionOverride = { deny?: string[] };

export type CallerContext =
  | { denied: "auth" | "inactive" | "expired" }
  | {
      denied?: undefined;
      id: string;
      role: RoleName;
      isSuperAdmin: boolean;
      branchId: string | null;
      deny: Set<string>;
    };

export async function loadCallerContext(): Promise<CallerContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { denied: "auth" };

  const profile = await db.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, role: true, isSuperAdmin: true, isActive: true, accessExpiresAt: true, branchId: true, permissions: true },
  });
  if (!profile?.isActive) return { denied: "inactive" };
  if (profile.accessExpiresAt && profile.accessExpiresAt < new Date()) return { denied: "expired" };

  const override = profile.permissions as PermissionOverride | null;
  return {
    id: profile.id,
    role: profile.role as RoleName,
    isSuperAdmin: profile.isSuperAdmin,
    branchId: profile.branchId,
    deny: new Set(override?.deny ?? []),
  };
}

function isDenied(ctx: Extract<CallerContext, { denied?: undefined }>, permissions: PermissionCheck): boolean {
  return Object.keys(permissions).some((resource) => ctx.deny.has(resource));
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
  if (isDenied(ctx, permissions)) return Err.forbidden();

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
  if (isDenied(ctx, permissions)) redirect("/admin");

  const result = await auth.api.userHasPermission({
    headers: await headers(),
    body: { role: ctx.role, permissions },
  });
  if (!result.success) redirect("/admin");
}

export type PageAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "auth" | "inactive" | "expired" | "forbidden" };

/**
 * Same check as requirePermissionPage, but returns a result instead of
 * redirecting — lets the caller render an in-place 403 (keeping the admin
 * shell mounted) instead of navigating away. Use requirePermissionPage when
 * a plain redirect is fine; use this when it isn't.
 */
export async function checkPermissionPage(permissions: PermissionCheck): Promise<PageAccessResult> {
  const ctx = await loadCallerContext();
  if (ctx.denied) return { allowed: false, reason: ctx.denied };
  if (ctx.isSuperAdmin) return { allowed: true };
  if (isDenied(ctx, permissions)) return { allowed: false, reason: "forbidden" };

  const result = await auth.api.userHasPermission({
    headers: await headers(),
    body: { role: ctx.role, permissions },
  });
  return result.success ? { allowed: true } : { allowed: false, reason: "forbidden" };
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
