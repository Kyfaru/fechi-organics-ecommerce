import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { exampleZonesForCounty } from "@/lib/delivery-zone-examples";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";

export async function GET(req: NextRequest) {
  await connection();
  const county = req.nextUrl.searchParams.get("county");
  if (!county) return Err.validation("county query parameter is required");

  try {
    const zones = await db.deliveryZone.findMany({
      where: { county, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, deliveryFeeKes: true, branchId: true },
    });
    return ok({ zones: zones.length ? zones : exampleZonesForCounty(county) });
  } catch (e) {
    if (isPrismaTableMissingError(e)) {
      return ok({ zones: exampleZonesForCounty(county) });
    }

    console.error("[delivery-zones] GET error", e);
    return Err.internal();
  }
}
