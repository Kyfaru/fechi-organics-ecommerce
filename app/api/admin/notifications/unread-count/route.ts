import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { Err, ok } from "@/lib/api";
import { loadCallerContext, requirePermission } from "@/lib/require-permission";
import { visibleNotificationTypes, resolveNotificationScope, buildNotificationWhere } from "@/lib/notifications/scope";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { notifications: ["view"] });
    if (denied) return denied;

    const resolved = await resolveNotificationScope(req);
    if (resolved instanceof Response) return resolved;
    const { scope, userId } = resolved;

    const ctx = await loadCallerContext();
    if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
    const allowedTypes = visibleNotificationTypes(ctx.role, ctx.isSuperAdmin, ctx.deny, ctx.mutedNotificationTypes);

    const count = await db.notification.count({
      where: {
        ...buildNotificationWhere(scope),
        type: { in: allowedTypes },
        NOT: { recipientStates: { some: { userId, readAt: { not: null } } } },
      },
    });

    return ok({ count });
  } catch (err) {
    reportError(err, { route: "GET /api/admin/notifications/unread-count", tags: { domain: "notifications" } });
    return Err.internal();
  }
}
