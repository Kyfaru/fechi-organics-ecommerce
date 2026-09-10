/**
 * GET /api/admin/activity
 *
 * Cursor-paginated audit log feed, joined with the admin user name/email via
 * adminProfile → user. Restricted to admin/super_admin — every other role
 * with staff:view still can't see this (stricter than the general
 * permission matrix, by design: this is meant to be a full who-did-what
 * trail across every branch, not something a branch manager should see).
 *
 * Query params:
 *   ?staffId=<adminProfileId>    — filter by staff member
 *   ?resource=<a,b,c>            — filter by entity type(s), comma-separated
 *   ?severity=<INFO|WARNING|CRITICAL> — exact match
 *   ?q=<text>                    — free-text match against action + staff name/email
 *   ?from=<ISO date>             — start of date range
 *   ?to=<ISO date>               — end of date range
 *   ?cursor=<auditLog id>        — last id from the previous page
 *   ?limit=<n>                   — page size, default 50, max 100
 */

import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import type { NotificationSeverity, Prisma } from "@prisma/client";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { staff: ["view"] });
  if (denied) return denied;

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();
  if (!caller.isSuperAdmin && caller.role !== "admin") return Err.forbidden();

  const { searchParams } = new URL(req.url);
  const staffId  = searchParams.get("staffId") ?? undefined;
  const resource = searchParams.get("resource") ?? undefined;
  const severity = searchParams.get("severity") ?? undefined;
  const q        = searchParams.get("q")?.trim() ?? undefined;
  const from     = searchParams.get("from") ?? undefined;
  const to       = searchParams.get("to") ?? undefined;
  const cursor   = searchParams.get("cursor") ?? undefined;
  const limit    = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 100);

  const where: Prisma.auditLogWhereInput = {};

  // Visibility: super admins see everything. A branch-scoped admin never
  // sees a super admin's activity, and only sees their own branch's staff.
  // An unscoped (branchId === null) admin sees every non-super-admin log
  // across every branch — treated as global scope. actorIsSuperAdmin/
  // branchId are write-time snapshots on auditLog itself (see
  // lib/admin-activity.ts), so this is a flat filter, not a join.
  if (!caller.isSuperAdmin) {
    where.actorIsSuperAdmin = false;
    if (caller.branchId) where.branchId = caller.branchId;
  }

  if (staffId) where.adminProfileId = staffId;
  if (resource) {
    const resources = resource.split(",").map((r) => r.trim()).filter(Boolean);
    if (resources.length === 1) where.resource = { equals: resources[0], mode: "insensitive" };
    else if (resources.length > 1) where.resource = { in: resources, mode: "insensitive" };
  }
  if (severity) where.severity = severity as NotificationSeverity;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { adminProfile: { user: { name: { contains: q, mode: "insensitive" } } } },
      { adminProfile: { user: { email: { contains: q, mode: "insensitive" } } } },
    ];
  }

  try {
    const logs = await db.auditLog.findMany({
      where,
      include: {
        adminProfile: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    const shaped = page.map((log) => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      severity: log.severity,
      details: log.details,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      path: log.path,
      createdAt: log.createdAt,
      adminProfileId: log.adminProfileId,
      staffName: log.adminProfile.user.name,
      staffEmail: log.adminProfile.user.email,
    }));

    return ok({ logs: shaped, nextCursor: hasMore ? page[page.length - 1].id : null });
  } catch (err) {
    reportError(err, { route: "GET /api/admin/activity", tags: { domain: "activity" } });
    console.error("[GET /api/admin/activity]", err);
    return Err.internal();
  }
}
