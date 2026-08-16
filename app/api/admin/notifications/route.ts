import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { Err, ok } from "@/lib/api";
import { loadCallerContext, requirePermission } from "@/lib/require-permission";
import { visibleNotificationTypes, resolveNotificationScope, buildNotificationWhere } from "@/lib/notifications/scope";
import { typesForCategory } from "@/lib/notifications/categories";
import type { NotificationSeverity, NotificationType, Prisma } from "@prisma/client";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { notifications: ["view"] });
    if (denied) return denied;

    const resolved = await resolveNotificationScope(req);
    if (resolved instanceof Response) return resolved;
    const { scope, userId } = resolved;

    // Self-contained call, same as requirePermission's own — see the design
    // brief for why this isn't threaded through instead.
    const ctx = await loadCallerContext();
    if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
    const allowedTypes = visibleNotificationTypes(ctx.role, ctx.isSuperAdmin, ctx.deny, ctx.mutedNotificationTypes);

    const params = req.nextUrl.searchParams;
    const search = params.get("search")?.trim();
    const type = params.get("type") as NotificationType | null;
    const category = params.get("category");
    // Comma-separated for the Filters panel's severity checkboxes (same
    // pattern as the activity route's ?resource=a,b,c), single value works too.
    const severityParam = params.get("severity");
    const severities = severityParam ? (severityParam.split(",") as NotificationSeverity[]) : [];
    const status = params.get("status"); // "unread" | "read" | "pinned"
    const branchIdParam = params.get("branchId");
    const cursor = params.get("cursor");
    const from = params.get("from") ?? undefined;
    const to = params.get("to") ?? undefined;

    // Security boundary (allowedTypes) always applies; ?category= and ?type=
    // narrow further within it — neither ever widens past it.
    const scopedTypes = category
      ? allowedTypes.filter((t) => typesForCategory(category).includes(t))
      : allowedTypes;
    const typeFilter: Prisma.notificationWhereInput =
      type
        ? scopedTypes.includes(type)
          ? { type }
          : { type: { in: [] } }
        : { type: { in: scopedTypes } };

    const where: Prisma.notificationWhereInput = {
      ...buildNotificationWhere(scope),
      ...typeFilter,
      ...(severities.length > 0 ? { severity: { in: severities } } : {}),
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
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    };

    // Dismissed-for-me notifications are always excluded, alongside whatever
    // status filter applies — combined via NOT array so neither clobbers the
    // other.
    const notClauses: Prisma.notificationWhereInput[] = [
      { recipientStates: { some: { userId, dismissed: true } } },
    ];

    if (status === "unread") {
      notClauses.push({ recipientStates: { some: { userId, readAt: { not: null } } } });
    } else if (status === "read") {
      where.recipientStates = { some: { userId, readAt: { not: null } } };
    } else if (status === "pinned") {
      where.recipientStates = { some: { userId, pinned: true } };
    }
    where.NOT = notClauses;

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
  } catch (err) {
    reportError(err, { route: "GET /api/admin/notifications", tags: { domain: "notifications" } });
    return Err.internal();
  }
}
