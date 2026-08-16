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

// PATCH /api/admin/notifications/[id] — marks read FOR THE CALLING USER ONLY.
// Per-user upsert on the (notificationId, userId) unique constraint, so two
// admins (or one admin double-clicking) never race or error.
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

    const state = await db.notificationRecipientState.upsert({
      where: { notificationId_userId: { notificationId: id, userId } },
      update: { readAt: new Date() },
      create: { notificationId: id, userId, readAt: new Date() },
    });

    await bumpNotificationVersion();
    return ok({ state });
  } catch (err) {
    reportError(err, { route: "PATCH /api/admin/notifications/[id]", tags: { domain: "notifications" } });
    return Err.internal();
  }
}

// DELETE /api/admin/notifications/[id] — dismisses FOR THE CALLING USER ONLY.
// The underlying `notification` row is shared across recipients, so this
// never deletes it — it just hides it from this admin's own feed via
// recipientState.dismissed, same per-user upsert pattern as PATCH/pin.
export async function DELETE(req: NextRequest, { params }: Params) {
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

    const state = await db.notificationRecipientState.upsert({
      where: { notificationId_userId: { notificationId: id, userId } },
      update: { dismissed: true },
      create: { notificationId: id, userId, dismissed: true },
    });

    await bumpNotificationVersion();
    return ok({ state });
  } catch (err) {
    reportError(err, { route: "DELETE /api/admin/notifications/[id]", tags: { domain: "notifications" } });
    return Err.internal();
  }
}
