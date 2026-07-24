import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { Err, ok } from "@/lib/api";
import { loadCallerContext, requirePermission } from "@/lib/require-permission";
import { allowedNotificationTypes, resolveNotificationScope, buildNotificationWhere } from "@/lib/notifications/scope";

export async function GET(req: NextRequest) {
  await connection();
  const denied = await requirePermission(req, { notifications: ["view"] });
  if (denied) return denied;

  const resolved = await resolveNotificationScope(req);
  if (resolved instanceof Response) return resolved;
  const { scope, userId } = resolved;

  const ctx = await loadCallerContext();
  if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
  const allowedTypes = allowedNotificationTypes(ctx.role, ctx.isSuperAdmin, ctx.deny);

  const count = await db.notification.count({
    where: {
      ...buildNotificationWhere(scope),
      type: { in: allowedTypes },
      NOT: { recipientStates: { some: { userId, readAt: { not: null } } } },
    },
  });

  return ok({ count });
}
