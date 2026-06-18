import { db } from "@/lib/db";

/**
 * Resolves the M-Pesa branch for a given county.
 *
 * First tries an exact county match on active branches.
 * Falls back to the first active branch if no county-specific branch exists.
 *
 * @param county - The Kenyan county name to match against branch records
 * @returns The matching branch record, or null if no active branches exist
 */
export async function resolveBranchForCounty(county: string) {
  // Try exact county match first
  const branch = await db.branch.findFirst({
    where: { county, isActive: true },
    select: {
      id: true,
      name: true,
      county: true,
      mpesaType: true,
      shortcode: true,
    },
  });

  if (branch) return branch;

  // Fallback to first active branch (e.g. Nairobi HQ) when county has no branch
  return await db.branch.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      county: true,
      mpesaType: true,
      shortcode: true,
    },
  });
}
