/**
 * Admin activity logger — write an auditLog entry non-blockingly.
 *
 * auditLog schema:
 *   id, adminProfileId, action, resource, resourceId?, severity, details?,
 *   ipAddress?, userAgent?, path?, branchId?, actorIsSuperAdmin, createdAt
 *
 * branchId/actorIsSuperAdmin are write-time snapshots of the actor's
 * adminProfile at the moment of logging (not a live join) — this preserves
 * "what branch was this admin in when they did this" even if they're
 * reassigned later, and lets the activity-log visibility filter
 * (GET /api/admin/activity) query flat columns instead of joining through
 * adminProfile on every read.
 *
 * Usage:
 *   await logActivity(adminProfileId, "Updated product", "product", productId, req);
 *   await logActivity(adminProfileId, "Deleted product", "product", productId, req, { reason }, "CRITICAL");
 *
 * The function never throws — audit logging is best-effort and must not break
 * the primary request path.
 */

import { db } from "@/lib/db";
import { NotificationSeverity, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { resourceForPath } from "@/lib/admin-nav";

export async function logActivity(
  adminProfileId: string,
  action: string,
  resource: string,
  resourceId?: string,
  req?: NextRequest,
  details?: Record<string, unknown>,
  severity: NotificationSeverity = "INFO",
): Promise<void> {
  try {
    const ipAddress = req?.headers.get("x-forwarded-for")?.split(",")[0].trim()
      ?? req?.headers.get("x-real-ip")
      ?? undefined;
    const userAgent = req?.headers.get("user-agent") ?? undefined;
    const path = req ? new URL(req.url).pathname : undefined;

    const actor = await db.adminProfile.findUnique({
      where: { id: adminProfileId },
      select: { branchId: true, isSuperAdmin: true },
    });

    await db.auditLog.create({
      data: {
        adminProfileId,
        action,
        resource,
        resourceId: resourceId ?? null,
        severity,
        details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        path: path ?? null,
        branchId: actor?.branchId ?? null,
        actorIsSuperAdmin: actor?.isSuperAdmin ?? false,
      },
    });
  } catch (err) {
    // Non-blocking: log to console but do not propagate
    console.warn("[logActivity] Failed to write audit log:", err);
  }
}

/**
 * Thin wrapper for page-view tracking — fired from AdminGuard on every
 * /admin/* page render. Never awaited by callers (must not slow down page
 * rendering); logActivity's own try/catch already makes it safe to fire
 * fully fire-and-forget.
 */
export async function logPageView(
  adminProfileId: string,
  pathname: string,
  req?: NextRequest,
): Promise<void> {
  await logActivity(
    adminProfileId,
    "Viewed page",
    resourceForPath(pathname) ?? "dashboard",
    undefined,
    req,
    { path: pathname },
    "INFO",
  );
}
