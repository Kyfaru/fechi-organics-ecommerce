import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { resolveNotificationScope } from "@/lib/notifications/scope";
import { bumpNotificationVersion } from "@/lib/notification-channel";
import { reportError } from "@/lib/observability";

interface Params {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/notifications/[id]/pin — toggles pinned FOR THE CALLING USER ONLY.
export async function PATCH(req: NextRequest, { params }: Params) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { notifications: ["manage"] });
    if (denied) return denied;

    const resolved = await resolveNotificationScope(req);
    if (resolved instanceof Response) return resolved;
    const { userId } = resolved;

    const { id } = await params;

    const current = await db.notificationRecipientState.findUnique({
      where: { notificationId_userId: { notificationId: id, userId } },
      select: { pinned: true },
    });
    const nextPinned = !current?.pinned;

    const state = await db.notificationRecipientState.upsert({
      where: { notificationId_userId: { notificationId: id, userId } },
      update: { pinned: nextPinned },
      create: { notificationId: id, userId, pinned: nextPinned },
    });

    await bumpNotificationVersion();
    return ok({ state });
  } catch (err) {
    reportError(err, { route: "PATCH /api/admin/notifications/[id]/pin", tags: { domain: "notifications" } });
    return Err.internal();
  }
}
