/**
 * Admin activity logger — write an auditLog entry non-blockingly.
 *
 * auditLog schema:
 *   id, adminProfileId, action, resource, resourceId?, severity, details?,
 *   ipAddress?, userAgent?, path?, createdAt
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
      },
    });
  } catch (err) {
    // Non-blocking: log to console but do not propagate
    console.warn("[logActivity] Failed to write audit log:", err);
  }
}
