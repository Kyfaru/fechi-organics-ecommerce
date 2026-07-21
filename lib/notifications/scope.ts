import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";

/**
 * Notification RBAC tiers (design doc Section 3):
 *   global  — Super Admin / Admin: every notification, every branch.
 *   manager — sees every role's notifications, but only for their own branch.
 *   staff   — sees only their own role's notifications, only for their own branch.
 */
export type NotificationScope =
  | { tier: "global" }
  | { tier: "manager"; branchId: string }
  | { tier: "staff"; branchId: string; role: string };

/**
 * Resolves the caller's notification scope from their session — never from a
 * client-supplied role/branchId. Returns an error Response to short-circuit
 * on, or the resolved scope + userId to continue with.
 */
export async function resolveNotificationScope(
  _req: NextRequest
): Promise<{ scope: NotificationScope; userId: string } | Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const profile = await db.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: { role: true, isSuperAdmin: true, isActive: true, accessExpiresAt: true, branchId: true },
  });

  if (!profile?.isActive) return Err.forbidden();
  if (profile.accessExpiresAt && profile.accessExpiresAt < new Date()) return Err.forbidden();

  if (profile.isSuperAdmin || profile.role === "admin") {
    return { scope: { tier: "global" }, userId: session.user.id };
  }

  if (!profile.branchId) return Err.forbidden();

  if (profile.role === "manager") {
    return { scope: { tier: "manager", branchId: profile.branchId }, userId: session.user.id };
  }

  return { scope: { tier: "staff", branchId: profile.branchId, role: profile.role }, userId: session.user.id };
}

/** Prisma `where` clause enforcing the scope — the single place row-level access is decided. */
export function buildNotificationWhere(scope: NotificationScope) {
  if (scope.tier === "global") return {};
  if (scope.tier === "manager") return { branchId: scope.branchId };
  return { branchId: scope.branchId, targetRoles: { has: scope.role } };
}
