/**
 * Creates the customer-coupon row for every loyalty account that predates it.
 *
 * Referral codes used to be resolved by a special case in the checkout rather
 * than existing as `promotion` rows. `ensureLoyaltyAccount` now creates one
 * automatically, but accounts opened before that change have a referralCode
 * with no matching coupon — invisible in the admin Customer Coupons tab, and
 * rejected at checkout.
 *
 * Idempotent: `promotion.code` is unique, so re-running skips what exists.
 *
 *   pnpm points:backfill-coupons            # dry run
 *   pnpm points:backfill-coupons --apply
 */

import { db } from "@/lib/db";
import { REFERRAL_DISCOUNT_PERCENT, MAX_REWARDED_REFERRALS } from "@/lib/points/rules";

async function main() {
  const apply = process.argv.includes("--apply");

  const accounts = await db.loyaltyPoints.findMany({
    select: { userId: true, referralCode: true },
    orderBy: { createdAt: "asc" },
  });

  const existing = await db.promotion.findMany({
    where: { code: { in: accounts.map((a) => a.referralCode) } },
    select: { code: true },
  });
  const haveCode = new Set(existing.map((e) => e.code));

  const missing = accounts.filter((a) => !haveCode.has(a.referralCode));

  console.log(
    `${accounts.length} loyalty account(s); ${missing.length} missing a coupon row${apply ? "" : "  (dry run)"}`,
  );

  if (!apply) {
    for (const a of missing) console.log(`  would create ${a.referralCode} for ${a.userId}`);
    if (missing.length) console.log("\nRe-run with --apply to create them.");
    return;
  }

  let created = 0;
  for (const a of missing) {
    try {
      await db.promotion.create({
        data: {
          name: `Referral code for ${a.userId}`,
          type: "PERCENTAGE",
          value: REFERRAL_DISCOUNT_PERCENT,
          code: a.referralCode,
          maxUses: MAX_REWARDED_REFERRALS,
          maxUsesPerUser: 1,
          ownerUserId: a.userId,
          status: "active",
        },
      });
      created++;
    } catch (e) {
      console.error(`  ${a.referralCode}: FAILED —`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`created ${created} coupon row(s)`);
}

main()
  .catch((e) => {
    console.error("backfill-referral-coupons failed", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
