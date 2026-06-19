import { db } from "@/lib/db";
import { haversineKm } from "@/lib/payments/haversine";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";

/**
 * Resolves the M-Pesa branch for a checkout.
 *
 * Priority:
 * 1. Direct branch on the selected delivery zone.
 * 2. Exact county branch.
 * 3. Nearest branch by county coordinates when available.
 * 4. First active branch.
 * @returns The matching branch record, or null if no active branches exist
 */
export async function resolveBranchForCounty(
  county: string,
  opts: { zoneId?: string | null; lat?: number | null; lng?: number | null } = {},
) {
  if (opts.zoneId) {
    const zone = await db.deliveryZone
      .findFirst({
        where: { id: opts.zoneId, isActive: true },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              county: true,
              mpesaType: true,
              shortcode: true,
              lat: true,
              lng: true,
            },
          },
        },
      })
      .catch((error) => {
        if (isPrismaTableMissingError(error)) return null;
        throw error;
      });
    if (zone?.branch) return zone.branch;
  }

  const branch = await db.branch.findFirst({
    where: { county, isActive: true },
    select: {
      id: true,
      name: true,
      county: true,
      mpesaType: true,
      shortcode: true,
      lat: true,
      lng: true,
    },
  });

  if (branch) return branch;

  if (typeof opts.lat === "number" && typeof opts.lng === "number") {
    const branches = await db.branch.findMany({
      where: { isActive: true, lat: { not: null }, lng: { not: null } },
      select: {
        id: true,
        name: true,
        county: true,
        mpesaType: true,
        shortcode: true,
        lat: true,
        lng: true,
      },
    });
    const nearest = branches
      .map((b) => ({
        branch: b,
        km: haversineKm(opts.lat!, opts.lng!, b.lat!, b.lng!),
      }))
      .sort((a, b) => a.km - b.km)[0]?.branch;
    if (nearest) return nearest;
  }

  return await db.branch.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      county: true,
      mpesaType: true,
      shortcode: true,
      lat: true,
      lng: true,
    },
  });
}
