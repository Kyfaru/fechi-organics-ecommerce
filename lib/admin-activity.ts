/**
 * Admin activity logger — write an auditLog entry non-blockingly.
 *
 * auditLog schema:
 *   id, adminProfileId, action, resource, resourceId?, details?, ipAddress?, createdAt
 *
 * Usage:
 *   await logActivity(adminProfileId, "Updated product", "product", productId, req);
 *
 * The function never throws — audit logging is best-effort and must not break
 * the primary request path.
 */

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

export async function logActivity(
  adminProfileId: string,
  action: string,
  resource: string,
  resourceId?: string,
  req?: NextRequest,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const ipAddress = req?.headers.get("x-forwarded-for")?.split(",")[0].trim()
      ?? req?.headers.get("x-real-ip")
      ?? undefined;

    await db.auditLog.create({
      data: {
        adminProfileId,
        action,
        resource,
        resourceId: resourceId ?? null,
        details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: ipAddress ?? null,
      },
    });
  } catch (err) {
    // Non-blocking: log to console but do not propagate
    console.warn("[logActivity] Failed to write audit log:", err);
  }
}
