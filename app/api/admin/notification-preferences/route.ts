/**
 * GET   /api/admin/notification-preferences — caller's own muted types + which types they can toggle
 * PATCH /api/admin/notification-preferences — replace the caller's muted-types set
 *
 * Self-service (requireStaffSession) — every role manages its own
 * adminProfile.mutedNotificationTypes, never someone else's.
 */

import { NextRequest, connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireStaffSession, loadCallerContext } from "@/lib/require-permission";
import { allowedNotificationTypes, LOCKED_NOTIFICATION_TYPES } from "@/lib/notifications/scope";
import { reportError } from "@/lib/observability";
import type { NotificationType } from "@prisma/client";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requireStaffSession(req);
  if (denied) return denied;

  try {
    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.authRequired();

    const allowed = allowedNotificationTypes(ctx.role, ctx.isSuperAdmin, ctx.deny);
    const toggleableTypes = allowed.filter((t) => !LOCKED_NOTIFICATION_TYPES.includes(t));
    const lockedTypes = allowed.filter((t) => LOCKED_NOTIFICATION_TYPES.includes(t));

    return ok({ mutedTypes: ctx.mutedNotificationTypes, toggleableTypes, lockedTypes });
  } catch (err) {
    reportError(err, { route: "GET /api/admin/notification-preferences", tags: { domain: "notifications" } });
    return Err.internal();
  }
}

const PatchSchema = z.object({
  mutedTypes: z.array(z.string()),
});

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requireStaffSession(req);
  if (denied) return denied;

  const ctx = await loadCallerContext();
  if (ctx.denied) return Err.authRequired();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return Err.validation("Field 'mutedTypes' must be an array of strings.");

  const toggleable = new Set(
    allowedNotificationTypes(ctx.role, ctx.isSuperAdmin, ctx.deny).filter(
      (t) => !LOCKED_NOTIFICATION_TYPES.includes(t)
    )
  );
  const invalid = parsed.data.mutedTypes.filter((t) => !toggleable.has(t as NotificationType));
  if (invalid.length > 0) {
    return Err.validation(`Not a mutable notification type: ${invalid.join(", ")}`);
  }

  try {
    await db.adminProfile.update({
      where: { id: ctx.id },
      data: { mutedNotificationTypes: parsed.data.mutedTypes as NotificationType[] },
    });
    return ok({ mutedTypes: parsed.data.mutedTypes });
  } catch (err) {
    reportError(err, { route: "PATCH /api/admin/notification-preferences", tags: { domain: "notifications" } });
    return Err.internal();
  }
}
