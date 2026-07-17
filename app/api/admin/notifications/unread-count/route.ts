import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { requireAdminPage } from "@/lib/admin-guard";
import { resolveNotificationScope, buildNotificationWhere } from "@/lib/notifications/scope";

export async function GET(req: NextRequest) {
  await connection();
  const denied = await requireAdminPage(req, "dashboard");
  if (denied) return denied;

  const resolved = await resolveNotificationScope(req);
  if (resolved instanceof Response) return resolved;
  const { scope, userId } = resolved;

  const count = await db.notification.count({
    where: {
      ...buildNotificationWhere(scope),
      NOT: { recipientStates: { some: { userId, readAt: { not: null } } } },
    },
  });

  return ok({ count });
}
