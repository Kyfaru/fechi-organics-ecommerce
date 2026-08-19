/**
 * Awards points for orders that were paid while the points engine was failing.
 *
 * POINTS_LEDGER_SECRET was unset in staging, so every awardPoints() call threw
 * and every call site caught it — customers paid and earned nothing, silently.
 * This replays the award pass for those orders.
 *
 * Safe to run repeatedly: every award is keyed on
 * (userId, reason, refType, refId) in the ledger, so an order that already
 * earned its points is a no-op rather than a double payout.
 *
 *   pnpm points:backfill            # dry run — reports what it would award
 *   pnpm points:backfill --apply    # actually award
 *
 * Orders are processed oldest-first so the "your Nth order" curve and the
 * streak windows come out the same as they would have at the time.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { awardPointsForOrder } from "@/lib/points/award-order";
import { evaluateBadges } from "@/lib/points/evaluate-badges";
import { getUserStats } from "@/lib/points/stats";
import { unlockJoiningBonus } from "@/lib/points/anti-abuse";
import { convertReferral, attachReferral } from "@/lib/points/referrals";
import { looksLikeReferralCode } from "@/lib/points/referral-discount";

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.POINTS_LEDGER_SECRET) {
    console.error(
      "POINTS_LEDGER_SECRET is not set. Set it BEFORE backfilling — entries signed\n" +
        "with a different key will fail verification once the real key is in place.",
    );
    process.exitCode = 1;
    return;
  }

  const [online, inStore] = await Promise.all([
    db.order.findMany({
      where: { paymentStatus: "PAID", userId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, orderNumber: true, promoCode: true, createdAt: true },
    }),
    db.inStoreOrder.findMany({
      where: { paymentStatus: "PAID", customerUserId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, customerUserId: true, orderNumber: true, promoCode: true, createdAt: true },
    }),
  ]);

  const orders = [
    ...online.map((o) => ({ ...o, userId: o.userId!, refType: "order" as const })),
    ...inStore.map((o) => ({ ...o, userId: o.customerUserId!, refType: "inStoreOrder" as const })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  console.log(`${orders.length} paid order(s) to consider${apply ? "" : "  (dry run)"}\n`);

  if (!apply) {
    const alreadyAwarded = await db.pointsLedger.count({ where: { reason: "ORDER_BASE" } });
    console.log(`ledger already holds ${alreadyAwarded} order-points entries`);
    for (const o of orders) {
      console.log(`  would award: ${o.orderNumber ?? o.id}  user=${o.userId}  (${o.refType})`);
    }
    console.log("\nRe-run with --apply to award them.");
    return;
  }

  let awarded = 0;
  let skipped = 0;

  for (const o of orders) {
    try {
      const summary = await awardPointsForOrder({ orderId: o.id, refType: o.refType });
      if (!summary) {
        skipped++;
        continue;
      }

      await unlockJoiningBonus({ userId: o.userId, orderId: o.id, refType: o.refType });

      if (o.promoCode && looksLikeReferralCode(o.promoCode)) {
        await attachReferral({ userId: o.userId, code: o.promoCode, ignoreOrderId: o.id });
      }
      await convertReferral({ userId: o.userId, orderId: o.id });

      await evaluateBadges(await getUserStats(o.userId));

      awarded++;
      console.log(
        `  ${o.orderNumber ?? o.id}: +${summary.totalPoints} points` +
          (summary.tierLabel ? ` (${summary.tierLabel})` : ""),
      );
    } catch (e) {
      skipped++;
      console.error(`  ${o.orderNumber ?? o.id}: FAILED —`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\nprocessed ${awarded}, skipped ${skipped}`);
  console.log("Run `pnpm points:verify` to confirm every chain reconciles.");
}

main()
  .catch((e) => {
    console.error("backfill failed", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
