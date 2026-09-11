/**
 * One-time correction for point balances inflated by badge families retired
 * when the achievements system was cut down to spend-only badges.
 *
 * The `badge`/`userBadge` tables were dropped, but every BADGE_AWARD entry
 * those retired families ever paid out is still sitting in the append-only
 * ledger, still counted in `loyaltyPoints.points`. This script finds every
 * BADGE_AWARD entry whose refId prefix (the family key, e.g. "earned.t17")
 * is not one of the two families that survived (`spend`, `bigorder`), sums
 * it per user, and writes ONE compensating ledger entry per affected user —
 * capped so no balance goes negative, since a customer may have already
 * redeemed points backed by the inflated balance.
 *
 * Safe to run repeatedly: the correction entry is keyed on
 * (userId, reason, refType, refId) in the ledger, so a second run is a no-op.
 *
 *   pnpm points:fix-badge-inflation            # dry run
 *   pnpm points:fix-badge-inflation --apply
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { awardPoints } from "@/lib/points/ledger";

const KEPT_FAMILIES = new Set(["spend", "bigorder"]);

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await db.pointsLedger.findMany({
    where: { reason: "BADGE_AWARD" },
    select: { userId: true, delta: true, refId: true },
  });

  const invalidByUser = new Map<string, number>();
  for (const r of rows) {
    const family = (r.refId ?? "unknown").split(".")[0];
    if (KEPT_FAMILIES.has(family)) continue;
    invalidByUser.set(r.userId, (invalidByUser.get(r.userId) ?? 0) + r.delta);
  }

  const affected = [...invalidByUser.entries()].filter(([, invalid]) => invalid > 0);
  console.log(`${affected.length} account(s) have invalid retired-badge points${apply ? "" : "  (dry run)"}\n`);

  let totalCorrected = 0;

  for (const [userId, invalid] of affected) {
    const loyalty = await db.loyaltyPoints.findUnique({
      where: { userId },
      select: { userCode: true, points: true },
    });
    if (!loyalty) continue;

    const correction = Math.min(loyalty.points, invalid);
    if (correction <= 0) continue;

    console.log(
      `  ${loyalty.userCode}: balance=${loyalty.points} invalid=${invalid} -> correction=-${correction}`,
    );

    if (apply) {
      const entry = await awardPoints({
        userId,
        delta: -correction,
        reason: "BADGE_AWARD_REVERSED",
        refType: "migration",
        refId: "retired-badge-families",
        meta: { invalidPoints: invalid, cappedAt: loyalty.points },
      });
      if (entry) totalCorrected += correction;
    }
  }

  if (!apply) {
    console.log("\nRe-run with --apply to write the corrections.");
  } else {
    console.log(`\nCorrected ${totalCorrected} point(s) across affected accounts.`);
    console.log("Run `pnpm points:verify` to confirm every chain still reconciles.");
  }
}

main()
  .catch((e) => {
    console.error("fix-legacy-badge-inflation failed", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
