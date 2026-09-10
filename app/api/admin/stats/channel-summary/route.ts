import { NextRequest } from "next/server";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import { getRevenueSeries, VALID_RANGES, type ChannelScope, type StatRange } from "@/lib/stats/channel-breakdown";

const SCOPES: ChannelScope[] = ["website", "home-delivery", "store-pickup", "instore"];

/** Revenue series for all four channels in one call — feeds the Reports channel pie + multi-series graph. */
export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { dashboard: ["view"] });
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const range = (searchParams.get("range") ?? "30d") as StatRange;
    if (!VALID_RANGES.includes(range)) return Err.validation("Invalid range");

    const results = await Promise.all(SCOPES.map((scope) => getRevenueSeries({ scope, range })));
    const scopes = Object.fromEntries(SCOPES.map((scope, i) => [scope, results[i]]));

    return ok({ range, scopes });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/stats/channel-summary", tags: { domain: "stats" } });
    console.error("[admin/stats/channel-summary] GET error", e);
    return Err.internal();
  }
}
