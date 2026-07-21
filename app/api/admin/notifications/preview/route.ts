import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { resolveNotificationScope, buildNotificationWhere } from "@/lib/notifications/scope";

// GET /api/admin/notifications/preview — backs the bell dropdown. Sort rule
// (design doc Section 5): unread+CRITICAL newest→oldest first, then other
// unread, then most-recently-read — capped to 5.
export async function GET(req: NextRequest) {
  await connection();
  const denied = await requirePermission(req, { notifications: ["view"] });
  if (denied) return denied;

  const resolved = await resolveNotificationScope(req);
  if (resolved instanceof Response) return resolved;
  const { scope, userId } = resolved;

  const candidates = await db.notification.findMany({
    where: buildNotificationWhere(scope),
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { recipientStates: { where: { userId } } },
  });

  const withState = candidates.map((n) => ({
    id: n.id,
    type: n.type,
    severity: n.severity,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
    isRead: n.recipientStates.some((r) => !!r.readAt),
  }));

  const unreadCritical = withState.filter((n) => !n.isRead && n.severity === "CRITICAL");
  const otherUnread = withState.filter((n) => !n.isRead && n.severity !== "CRITICAL");
  const read = withState.filter((n) => n.isRead);

  const notifications = [...unreadCritical, ...otherUnread, ...read].slice(0, 5);

  return ok({ notifications });
}
