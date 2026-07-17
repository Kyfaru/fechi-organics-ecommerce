import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { Err } from "@/lib/api";
import { requireAdminPage } from "@/lib/admin-guard";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { resolveNotificationScope, buildNotificationWhere } from "@/lib/notifications/scope";
import { bumpNotificationVersion } from "@/lib/notification-channel";
import { makeRatelimit } from "@/lib/ratelimit";
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = makeRatelimit(Ratelimit.slidingWindow(5, "1 m"), "notif_mark_all");

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const denied = await requireAdminPage(req, "dashboard");
  if (denied) return denied;

  const resolved = await resolveNotificationScope(req);
  if (resolved instanceof Response) return resolved;
  const { scope, userId } = resolved;

  if (ratelimit) {
    const { success } = await ratelimit.limit(userId);
    if (!success) return Err.rateLimited();
  }

  const unread = await db.notification.findMany({
    where: {
      ...buildNotificationWhere(scope),
      NOT: { recipientStates: { some: { userId, readAt: { not: null } } } },
    },
    select: { id: true },
    take: 500,
  });

  await db.$transaction(
    unread.map((n) =>
      db.notificationRecipientState.upsert({
        where: { notificationId_userId: { notificationId: n.id, userId } },
        update: { readAt: new Date() },
        create: { notificationId: n.id, userId, readAt: new Date() },
      })
    )
  );

  await bumpNotificationVersion();
  return ok({ marked: unread.length });
}
