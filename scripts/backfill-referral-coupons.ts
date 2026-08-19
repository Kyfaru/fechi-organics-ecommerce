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
    select: {
      userId: true,
      referralCode: true,
      // Named so the admin coupon table reads as a person, not a uuid.
      user: { select: { name: true, email: true } },
    },
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

  const labelFor = (a: (typeof accounts)[number]) =>
    a.user?.name?.trim() || a.user?.email?.trim() || a.userId;

  // Rows created before the coupon was named after the customer still read
  // "Referral code for <uuid>". Repair those in the same pass.
  const byCode = new Map(accounts.map((a) => [a.referralCode, a]));
  const stale = (
    await db.promotion.findMany({
      where: { ownerUserId: { not: null } },
      select: { id: true, code: true, name: true },
    })
  ).flatMap((p) => {
    const account = p.code ? byCode.get(p.code) : undefined;
    if (!account) return [];
    const wanted = `Referral code for ${labelFor(account)}`;
    return p.name === wanted ? [] : [{ id: p.id, from: p.name, to: wanted }];
  });

  if (stale.length) console.log(`${stale.length} coupon name(s) still using a raw id`);

  if (!apply) {
    for (const a of missing) console.log(`  would create ${a.referralCode} for ${labelFor(a)}`);
    for (const s of stale) console.log(`  would rename "${s.from}" -> "${s.to}"`);
    if (missing.length || stale.length) console.log("\nRe-run with --apply to write them.");
    return;
  }

  for (const s of stale) {
    try {
      await db.promotion.update({ where: { id: s.id }, data: { name: s.to } });
    } catch (e) {
      console.error(`  rename failed for ${s.id}:`, e instanceof Error ? e.message : e);
    }
  }
  if (stale.length) console.log(`renamed ${stale.length} coupon(s)`);

  let created = 0;
  for (const a of missing) {
    try {
      await db.promotion.create({
        data: {
          name: `Referral code for ${labelFor(a)}`,
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
