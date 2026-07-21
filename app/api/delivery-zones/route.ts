import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { exampleZonesForCounty } from "@/lib/delivery-zone-examples";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";

/**
 * GET /api/delivery-zones?county=<name>
 *
 * `county` is optional — when omitted, returns all active zones nationwide
 * (mirrors the all-vs-scoped pattern in app/api/branches/route.ts).
 */
export async function GET(req: NextRequest) {
  await connection();
  const county = req.nextUrl.searchParams.get("county");

  try {
    const zones = county
      ? await db.deliveryZone.findMany({
          where: { county, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, deliveryFeeKes: true, branchId: true, county: true },
        })
      : await db.deliveryZone.findMany({
          where: { isActive: true },
          orderBy: [{ county: "asc" }, { name: "asc" }],
          select: { id: true, name: true, deliveryFeeKes: true, branchId: true, county: true },
        });
    return ok({ zones });
  } catch (e) {
    if (isPrismaTableMissingError(e)) {
      return ok({ zones: [] });
    }

    console.error("[delivery-zones] GET error", e);
    return Err.internal(e);
  }
}
