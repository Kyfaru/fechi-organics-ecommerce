import { NextRequest } from "next/server";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import {
  getPointsUtilisedSeries,
  VALID_SCOPES,
  VALID_RANGES,
  type ChannelScope,
  type StatRange,
} from "@/lib/stats/channel-breakdown";

/**
 * GET /api/admin/stats/points-utilised?scope=&range=
 *
 * `value` is the cash value of redeemed points in cents, so it formats like
 * every other money card; `points` is the raw count. This is deliberately NOT
 * part of revenue — points-funded value is already excluded from totalKes.
 */
export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { dashboard: ["view"] });
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const scope = (searchParams.get("scope") ?? "total") as ChannelScope;
    const range = (searchParams.get("range") ?? "30d") as StatRange;

    if (!VALID_SCOPES.includes(scope)) return Err.validation("Invalid scope");
    if (!VALID_RANGES.includes(range)) return Err.validation("Invalid range");

    return ok(await getPointsUtilisedSeries({ scope, range }));
  } catch (e) {
    reportError(e, { route: "GET /api/admin/stats/points-utilised", tags: { domain: "stats" } });
    return Err.internal();
  }
}
