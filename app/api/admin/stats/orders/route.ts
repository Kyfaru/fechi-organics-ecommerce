import { NextRequest } from "next/server";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import { getOrderSeries, VALID_SCOPES, VALID_RANGES, type ChannelScope, type StatRange } from "@/lib/stats/channel-breakdown";

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

    const result = await getOrderSeries({ scope, range });
    return ok(result);
  } catch (e) {
    reportError(e, { route: "GET /api/admin/stats/orders", tags: { domain: "stats" } });
    console.error("[admin/stats/orders] GET error", e);
    return Err.internal();
  }
}
