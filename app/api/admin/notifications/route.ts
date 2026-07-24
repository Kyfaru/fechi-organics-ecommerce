import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { Err, ok } from "@/lib/api";
import { loadCallerContext, requirePermission } from "@/lib/require-permission";
import { allowedNotificationTypes, resolveNotificationScope, buildNotificationWhere } from "@/lib/notifications/scope";
import type { NotificationSeverity, NotificationType, Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  await connection();
  const denied = await requirePermission(req, { notifications: ["view"] });
  if (denied) return denied;

  const resolved = await resolveNotificationScope(req);
  if (resolved instanceof Response) return resolved;
  const { scope, userId } = resolved;

  // Self-contained call, same as requirePermission's own — see the design
  // brief for why this isn't threaded through instead.
  const ctx = await loadCallerContext();
  if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
  const allowedTypes = allowedNotificationTypes(ctx.role, ctx.isSuperAdmin, ctx.deny);

  const params = req.nextUrl.searchParams;
  const search = params.get("search")?.trim();
  const type = params.get("type") as NotificationType | null;
  const severity = params.get("severity") as NotificationSeverity | null;
  const status = params.get("status"); // "unread" | "read" | "pinned"
  const branchIdParam = params.get("branchId");
  const cursor = params.get("cursor");

  // Security boundary (allowedTypes) always applies; the client's ?type=
  // filter narrows further within it — never widens past it.
  const typeFilter: Prisma.notificationWhereInput =
    type
      ? allowedTypes.includes(type)
        ? { type }
        : { type: { in: [] } }
      : { type: { in: allowedTypes } };

  const where: Prisma.notificationWhereInput = {
    ...buildNotificationWhere(scope),
    ...typeFilter,
    ...(severity ? { severity } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { body: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    // Branch override only ever honored for the global tier — resolved from
    // the session, never trusted from the query string for manager/staff.
    ...(branchIdParam && scope.tier === "global" ? { branchId: branchIdParam } : {}),
  };

  if (status === "unread") {
    where.NOT = { recipientStates: { some: { userId, readAt: { not: null } } } };
  } else if (status === "read") {
    where.recipientStates = { some: { userId, readAt: { not: null } } };
  } else if (status === "pinned") {
    where.recipientStates = { some: { userId, pinned: true } };
  }

  const notifications = await db.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { recipientStates: { where: { userId } } },
  });

  const nextCursor = notifications.length === 30 ? notifications[notifications.length - 1].id : null;

  return ok({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      severity: n.severity,
      title: n.title,
      body: n.body,
      link: n.link,
      branchId: n.branchId,
      createdAt: n.createdAt,
      isRead: n.recipientStates.some((r) => !!r.readAt),
      isPinned: n.recipientStates.some((r) => r.pinned),
    })),
    nextCursor,
    scope: scope.tier,
  });
}
