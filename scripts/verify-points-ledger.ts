/**
 * Re-walks every customer's points chain and reports any that do not reconcile.
 *
 *   pnpm points:verify              # check everyone
 *   pnpm points:verify <userId>     # check one account
 *
 * The HMAC chain makes tampering detectable; this is the thing that does the
 * detecting. The nightly worker at /api/admin/workers/verify-points runs the
 * same check and raises a CRITICAL notification on a break.
 *
 * Exits non-zero when anything is wrong, so CI or a cron wrapper can alert.
 */

// Env is loaded by scripts/run-ts.js before this module is required.
import { verifyChain } from "@/lib/points/ledger";
import { db } from "@/lib/db";

async function main() {
  const only = process.argv[2];

  const users = only
    ? [{ userId: only }]
    : await db.loyaltyPoints.findMany({ select: { userId: true }, orderBy: { createdAt: "asc" } });

  if (users.length === 0) {
    console.log("[points:verify] no loyalty accounts yet — nothing to check");
    return;
  }

  let checked = 0;
  let entries = 0;
  const broken: Array<{ userId: string; reason?: string; seq?: number }> = [];

  for (const u of users) {
    const res = await verifyChain(u.userId);
    checked++;
    entries += res.entries;
    if (!res.ok) {
      broken.push({ userId: u.userId, reason: res.reason, seq: res.brokenAtSeq });
      console.error(
        `[points:verify] BROKEN ${u.userId} — ${res.reason}${res.brokenAtSeq ? ` at seq ${res.brokenAtSeq}` : ""}` +
          (res.computedBalance !== undefined ? ` (ledger says ${res.computedBalance}, cache says ${res.cachedBalance})` : ""),
      );
    }
  }

  console.log(`[points:verify] ${checked} account(s), ${entries} ledger entries`);

  if (broken.length > 0) {
    console.error(`[points:verify] ${broken.length} chain(s) FAILED verification`);

    // Tampering breaks ONE chain at ONE entry. Every chain failing at its very
    // first entry means the entries were signed with a different key than the
    // one this process is holding — almost always running locally against a
    // deployed database. Say so, rather than let it read as a breach.
    const allAtSeqOne =
      broken.length === checked && broken.every((b) => b.seq === 1 && b.reason === "HASH_MISMATCH");
    if (allAtSeqOne) {
      console.error(
        "\n[points:verify] Every chain failed at its first entry, which is the signature of a\n" +
          "KEY MISMATCH, not tampering. These entries were signed with a different\n" +
          "POINTS_LEDGER_SECRET than the one in this environment. Use the same key\n" +
          "everywhere that touches this database, and never rotate it — rotating\n" +
          "invalidates every existing hash.",
      );
    }

    process.exitCode = 1;
    return;
  }
  console.log("[points:verify] all chains intact");
}

main()
  .catch((e) => {
    console.error("[points:verify] failed", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
