import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { getPeriodChange } from "@/lib/stats";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import { bucketKey, generateBuckets } from "@/lib/date-buckets";
import { resolveWindow, granularityFor, VALID_RANGES, type StatRange } from "@/lib/stats/channel-breakdown";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { dashboard: ["view"] });
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const range = (searchParams.get("range") ?? "30d") as StatRange;
    if (!VALID_RANGES.includes(range)) return Err.validation("Invalid range");

    const now = new Date();
    const granularity = granularityFor(range);
    const { gte, prevGte, prevLte } = resolveWindow(range, now);
    const dateFilter = gte ? { gte, lte: now } : { lte: now };

    const [currentUsers, previousUsers] = await Promise.all([
      db.user.findMany({ where: { role: "client", createdAt: dateFilter }, select: { createdAt: true } }),
      prevGte
        ? db.user.findMany({ where: { role: "client", createdAt: { gte: prevGte, lte: prevLte! } }, select: { createdAt: true } })
        : Promise.resolve([]),
    ]);

    const bucketMap: Record<string, number> = {};
    for (const u of currentUsers) {
      const key = bucketKey(u.createdAt, granularity);
      bucketMap[key] = (bucketMap[key] ?? 0) + 1;
    }
    const buckets = generateBuckets(gte, now, granularity);
    const series = buckets.map((date) => ({ date, value: bucketMap[date] ?? 0 }));

    return ok({
      value: currentUsers.length,
      change: getPeriodChange(currentUsers.length, previousUsers.length),
      series,
    });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/stats/customers", tags: { domain: "stats" } });
    console.error("[admin/stats/customers] GET error", e);
    return Err.internal();
  }
}
