import { NextRequest } from "next/server";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import { getConversionSummary } from "@/lib/stats/conversion";
import { VALID_RANGES, type StatRange } from "@/lib/stats/channel-breakdown";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { dashboard: ["view"] });
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const range = (searchParams.get("range") ?? "30d") as StatRange;
    if (!VALID_RANGES.includes(range)) return Err.validation("Invalid range");

    const sources = await getConversionSummary(range);
    return ok({ range, sources });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/stats/conversion", tags: { domain: "stats" } });
    console.error("[admin/stats/conversion] GET error", e);
    return Err.internal();
  }
}
