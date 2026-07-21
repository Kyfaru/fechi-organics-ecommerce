import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

/**
 * GET /api/branches?county=<name>
 *
 * Returns the active M-Pesa branch for a given county.
 * Falls back to the first active branch when no county-specific branch exists.
 *
 * Query params:
 *   county (required) — the Kenyan county name
 *
 * Returns:
 *   200 { data: { id, name, county, mpesaType, shortcode, phone } }
 *   400 when county param is missing
 *   500 on unexpected errors
 */
export async function GET(req: NextRequest) {
  await connection();
  try {
    const county = req.nextUrl.searchParams.get("county");

    if (!county) {
      const branches = await db.branch.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          county: true,
          mpesaType: true,
          shortcode: true,
          phone: true,
          cardEligible: true,
        },
      });
      return ok({ branches });
    }

    const branch = await db.branch.findFirst({
      where: { county, isActive: true },
      select: {
        id: true,
        name: true,
        county: true,
        mpesaType: true,
        shortcode: true,
        phone: true,
        cardEligible: true,
      },
    });

    // Fallback to first active branch if no match for this county
    const result =
      branch ??
      (await db.branch.findFirst({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          county: true,
          mpesaType: true,
          shortcode: true,
          phone: true,
        },
      }));

    return ok(result);
  } catch (e) {
    console.error("[branches] GET error", e);
    return Err.internal();
  }
}
