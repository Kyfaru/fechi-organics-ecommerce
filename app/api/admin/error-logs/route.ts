/**
 * GET /api/admin/error-logs
 *
 * Cursor-paginated feed of `errorLog` rows (see lib/observability-server.ts's
 * logServerError, which writes them) — the plain-language admin error log at
 * app/admin/(protected)/error-logs. Restricted to admin/super_admin, same as
 * GET /api/admin/activity.
 *
 * Query params:
 *   ?cursor=<errorLog id> — last id from the previous page
 *   ?limit=<n>            — page size, default 50, max 100
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection } from "next/server";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import { interpretErrorLog } from "@/lib/error-log-interpreter";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { staff: ["view"] });
  if (denied) return denied;

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();
  if (!caller.isSuperAdmin && caller.role !== "admin") return Err.forbidden();

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 100);

  try {
    const logs = await db.errorLog.findMany({
      orderBy: { occurredAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    const shaped = page.map((log) => ({
      id: log.id,
      code: log.code,
      category: log.category,
      message: log.message,
      friendlyMessage: interpretErrorLog(log),
      route: log.route,
      userId: log.userId,
      orderId: log.orderId,
      occurredAt: log.occurredAt,
    }));

    return ok({ logs: shaped, nextCursor: hasMore ? page[page.length - 1].id : null });
  } catch (err) {
    reportError(err, { route: "GET /api/admin/error-logs", tags: { domain: "error-logs" } });
    console.error("[GET /api/admin/error-logs]", err);
    return Err.internal();
  }
}
