import { headers } from "next/headers";
import { NextRequest } from "next/server";
import type { NotificationType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import type { RoleName } from "@/lib/permissions";
import { grantsFor } from "@/lib/permissions";
import { NOTIFICATION_TYPE_RESOURCE } from "@/lib/notifications/type-resource-map";

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

// Exhaustive over NotificationType via NOTIFICATION_TYPE_RESOURCE's keys —
// there's no runtime `Object.values` support for a Prisma-generated enum, so
// this map (which the build already enforces is exhaustive) is the
// enumeration source.
const ALL_NOTIFICATION_TYPES = Object.keys(NOTIFICATION_TYPE_RESOURCE) as NotificationType[];

/**
 * Content-level filter on top of `buildNotificationWhere`'s row-level scope:
 * which notification `type`s a role is allowed to see, based on whether it
 * has view access to the resource that type is about. Every role already has
 * route access to the notifications endpoints (universal `notifications:
 * ["view","manage"]` grant — see lib/permissions.ts), so without this a role
 * with no `orders` grant (e.g. `viewer`) would still see `ORDER_NEW` rows.
 */
export function allowedNotificationTypes(
  role: RoleName,
  isSuperAdmin: boolean,
  deny: Set<string>
): NotificationType[] {
  if (isSuperAdmin) return ALL_NOTIFICATION_TYPES;

  return ALL_NOTIFICATION_TYPES.filter((type) => {
    const resource = NOTIFICATION_TYPE_RESOURCE[type];
    if (resource === null) return true; // SYSTEM_ALERT — always visible
    if (deny.has(resource)) return false;
    return grantsFor(role, resource).includes("view");
  });
}
