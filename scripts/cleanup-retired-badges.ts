/**
 * Removes badge rows (and the userBadge grants referencing them) for families
 * that no longer exist in lib/points/badge-families.ts.
 *
 * The achievement catalog was cut down to spend-only families — order count,
 * tenure, points balance, reviews, wishlist, etc. are no longer valid
 * achievements. Editing badge-families.ts and re-running `pnpm seed:badges`
 * upserts the new catalog, but never deletes the old rows on its own, so this
 * script does that half.
 *
 * There is no foreign key between `userBadge.badgeId` and `badge.id` (they
 * live in different Postgres schemas), so deleting `badge` rows cannot
 * violate a constraint — but userBadge rows are still deleted first, in the
 * correct data-hygiene order.
 *
 * Points already paid out via historical BADGE_AWARD ledger entries for these
 * badges are NOT clawed back — the ledger is append-only by design. This is
 * an accepted, bounded, one-time cost of the migration.
 *
 *   pnpm points:cleanup-retired-badges            # dry run
 *   pnpm points:cleanup-retired-badges --apply
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { BADGE_FAMILIES } from "@/lib/points/badge-families";
import { syncLevel } from "@/lib/points/evaluate-badges";

const KEPT_FAMILY_KEYS = [...BADGE_FAMILIES.map((f) => f.key), "inhouse"];

async function main() {
  const apply = process.argv.includes("--apply");

  const retired = await db.badge.findMany({
    where: { familyKey: { notIn: KEPT_FAMILY_KEYS } },
    select: { id: true, familyKey: true },
  });

  if (retired.length === 0) {
    console.log("No retired badge rows found — nothing to clean up.");
    return;
  }

  const retiredIds = retired.map((b) => b.id);
  const byFamily = new Map<string, number>();
  for (const b of retired) byFamily.set(b.familyKey, (byFamily.get(b.familyKey) ?? 0) + 1);

  console.log(`${retired.length} retired badge row(s) across ${byFamily.size} family/families:`);
  for (const [family, count] of byFamily) console.log(`  ${family}: ${count}`);

  const affectedGrants = await db.userBadge.findMany({
    where: { badgeId: { in: retiredIds } },
    select: { userId: true },
  });
  const affectedUserIds = [...new Set(affectedGrants.map((g) => g.userId))];

  console.log(
    `${affectedGrants.length} userBadge grant(s) across ${affectedUserIds.length} customer(s) reference these badges.`,
  );

  if (!apply) {
    console.log("\nRe-run with --apply to delete them and re-sync affected customers' levels.");
    return;
  }

  await db.userBadge.deleteMany({ where: { badgeId: { in: retiredIds } } });
  await db.badge.deleteMany({ where: { id: { in: retiredIds } } });
  console.log(`Deleted ${affectedGrants.length} userBadge row(s) and ${retiredIds.length} badge row(s).`);

  for (const userId of affectedUserIds) {
    const remaining = await db.userBadge.count({ where: { userId } });
    await syncLevel(userId, remaining);
  }
  console.log(`Re-synced level for ${affectedUserIds.length} customer(s).`);
}

main()
  .catch((e) => {
    console.error("cleanup-retired-badges failed", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
