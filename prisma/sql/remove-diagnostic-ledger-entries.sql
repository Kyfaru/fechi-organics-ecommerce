-- One-off cleanup: removes points ledger entries written by a diagnostic run.
--
-- Context: while diagnosing why no customer was earning points, a single test
-- entry was written locally, and therefore signed with the development
-- fallback key rather than the real POINTS_LEDGER_SECRET. Once the real key is
-- in place, `pnpm points:verify` reports that customer's chain as HASH_MISMATCH
-- — correctly, because the entry cannot be re-derived from the real key.
--
-- Safe because it only touches rows tagged refType = 'diagnostic', which
-- nothing in the application ever writes. Real entries use 'order',
-- 'inStoreOrder', 'badge', 'grant', 'referral', 'signup', 'unlock',
-- 'streak' or 'abuse'.
--
-- Run BEFORE `pnpm points:backfill`, and only while the ledger holds no real
-- data. Once genuine points exist, correct by adding a compensating entry
-- instead of deleting — that is the whole point of an append-only ledger.
--
--   pnpm prisma db execute --file prisma/sql/remove-diagnostic-ledger-entries.sql
--
-- Note: this must run BEFORE points-ledger-guard.sql installs the append-only
-- trigger, which blocks DELETE outright.

BEGIN;

-- Reset the cached balances of anyone affected, so the cache agrees with the
-- (now empty) chain. awardPoints recomputes these from the ledger on the next
-- entry regardless, but leaving them wrong would make verifyChain report
-- CACHE_MISMATCH in the meantime.
UPDATE public."loyaltyPoints"
SET    "points" = 0,
       "lockedPoints" = 0,
       "lifetimeEarned" = 0,
       "lifetimeRedeemed" = 0
WHERE  "userId" IN (
         SELECT DISTINCT "userId" FROM public."pointsLedger" WHERE "refType" = 'diagnostic'
       );

DELETE FROM public."pointsLedger" WHERE "refType" = 'diagnostic';

COMMIT;
