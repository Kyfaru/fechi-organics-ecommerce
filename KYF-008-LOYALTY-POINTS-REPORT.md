# KYF-008 — Fechi Points Loyalty System: Build Report

Evidence-based report on the loyalty/points system built across `11e0bfb`, `ae81bba`, `a396043`, plus the uncommitted work currently in the tree (`git status` at time of writing: 14 modified files, 4 untracked, all under `lib/points`, `lib/checkout`, `lib/promotions`, `app/api/admin/promotions`, `components/admin`, `prisma/schema.prisma`). Every claim below was checked directly against source; where something didn't match what the brief described, that's called out under §11 rather than silently corrected.

---

## 1 · Architecture — module map

`lib/points/*`, split by whether the file can be imported from a client component:

| Module | server-only? | Purpose |
|---|---|---|
| `rules.ts` | **No — pure** | Earning curve, value tiers, streak math, free-points constants, `CENTS_PER_POINT` |
| `levels.ts` | **No — pure** | Badge-count → level curve (imports `badge-families.ts` only) |
| `badge-families.ts` | **No — pure** | The 20-family × 50-tier badge catalog generator + 8 manual badges |
| `invite-message.ts` | **No — pure** | WhatsApp/SMS referral message builder (imports `rules.ts` only) |
| `fingerprint.ts` | **No — browser-only** | Client-side device fingerprint collector, no `db` import |
| `ledger.ts` | **Yes** — `ledger.ts:21` | The only write path to `pointsLedger` |
| `award-order.ts` | **Yes** — `award-order.ts:16` | Turns a paid order into `ORDER_BASE`/`ORDER_VALUE_TIER`/streak points + VIP coupons |
| `redeem.ts` | **Yes** — `redeem.ts:18` | Hold/release/reverse points spent at checkout |
| `anti-abuse.ts` | **Yes** — `anti-abuse.ts:25` | Identity-signal scoring, joining-bonus unlock/void |
| `referrals.ts` | **Yes** — `referrals.ts:17` | Joining bonus, referral attach/convert, referrer notification |
| `referral-discount.ts` | **Yes** — `referral-discount.ts:17` | Resolves a coupon code back to the referring `userId` |
| `grants.ts` | **Yes** — `grants.ts:26` | Unanimous super-admin points grant workflow |
| `evaluate-badges.ts` | **Yes** — `evaluate-badges.ts:12` | Compares a `UserStats` snapshot against the catalog, unlocks + credits |
| `stats.ts` | **Yes** — `stats.ts:15` | One `UserStats` snapshot per award pass, built from 9 parallel queries |

Every server-only file carries the same `import "server-only"` line with an identical comment explaining why (`ledger.ts:18-21` is the canonical wording, repeated verbatim in `award-order.ts:13-16`, `redeem.ts:15-18`, `anti-abuse.ts:22-25`, `referrals.ts:14-17`, `referral-discount.ts:14-17`, `grants.ts:23-26`, `evaluate-badges.ts:9-12`, `stats.ts:12-15`). This is not boilerplate — it's the direct fix for incident 2 below (§8.2).

`rules.ts:14-23` documents *why* the split exists in its own words: any client-safe constant a storefront page needs (`CENTS_PER_POINT`, `pointsToCents`, `REFERRAL_DISCOUNT_PERCENT`, etc.) lives in the pure module. `ledger.ts:34` re-exports the same three functions from `rules.ts` so existing server call sites didn't have to change their import path when the split happened.

---

## 2 · The ledger

`lib/points/ledger.ts` is the single append point for `pointsLedger` (Prisma model `pointsLedger`, `prisma/schema.prisma:1233-1259`).

**Why a hash chain instead of encrypting the balance column:** encryption protects confidentiality of a value at rest — it stops someone reading the balance, not tampering with it. An attacker (or a bug) with `UPDATE`/`DELETE` access can still overwrite an encrypted column with a different ciphertext, or delete a row, or reorder rows, and the decrypted value looks perfectly valid afterward. A hash chain protects *integrity*: each entry's `hash` (`ledger.ts:95-110`) is an HMAC over the previous entry's hash plus every field of the current one (`prevHash`, `userId`, `seq`, `delta`, `lockedDelta`, `balanceAfter`, `lockedAfter`, `reason`, `refType`, `refId`, `createdAt`). Edit any field of any row, delete a row, or swap the order of two rows, and every hash from that point forward stops matching what `verifyChain()` recomputes (`ledger.ts:361-422`). The HMAC secret (`POINTS_LEDGER_SECRET`) lives in the environment, not the database, so read/write access to Postgres alone — a leaked `DATABASE_URL`, a compromised app role, a careless `psql` session — is not enough to forge a valid entry; the attacker would also need the secret, which the database itself never sees.

Two independent layers on top of the chain:

1. **`delta` / `lockedDelta`** — every ledger row moves one or both of two pots in one entry: spendable balance (`delta`) and the not-yet-spendable locked pot (`lockedDelta`). The schema comment at `prisma/schema.prisma:1237-1239` enumerates every legal shape: earn `(+d, 0)`, lock `(0, +d)`, unlock `(+d, -d)`, void `(0, -d)`, redeem `(-d, 0)`. `appendEntry()` (`ledger.ts:219-307`) refuses to let either running total go negative (`ledger.ts:241-246`).

2. **The `@@unique([userId, reason, refType, refId])` replay guard** (`prisma/schema.prisma:1255`) — this is what makes every award call idempotent. A QStash job that redelivers, a webhook that fires twice, a script re-run — all of them hit this constraint on the second attempt and `awardPoints()` catches the Postgres unique-violation (`P2002`, `ledger.ts:214-217`) and returns `null` rather than throwing (`ledger.ts:315-323`). The docstring at `ledger.ts:310-314` is explicit that `null` is a *success* from the caller's point of view, not an error — callers throughout the codebase (`award-order.ts`, `evaluate-badges.ts`, the award-points worker) branch on truthiness of the returned entry, not on a try/catch.

3. **`verifyChain(userId)`** (`ledger.ts:361-422`) re-walks a user's full chain, re-deriving every hash from scratch and cross-checking the running `balanceAfter`/`lockedAfter` against the `loyaltyPoints` cache row. It distinguishes five distinct failure modes (`SEQUENCE_GAP`, `PREV_HASH_MISMATCH`, `BALANCE_MISMATCH`, `HASH_MISMATCH`, `CACHE_MISMATCH`), which is what lets `pnpm points:verify` and the nightly cron report *where* a chain broke, not just *that* it broke.

4. **`prisma/sql/points-ledger-guard.sql`** — a second, database-level layer, independent of the application. A `BEFORE UPDATE OR DELETE` trigger (`points_ledger_no_mutate`) raises an exception on any attempted mutation of `public."pointsLedger"`, for any role including the application's own — the trigger doesn't distinguish who is asking. The file's own comment (lines 3-6) states the intended split of responsibility precisely: the HMAC chain makes tampering *detectable*, the trigger makes it *fail*, and the trigger still leaves one gap the chain covers — a superuser can run `ALTER TABLE ... DISABLE TRIGGER` to bypass it, but cannot forge a hash without the secret. A second, commented-out layer (`REVOKE UPDATE, DELETE, TRUNCATE ... FROM :app_role`, lines 26-33) is left inactive because the role name is environment-specific and a typo there would abort the whole deploy script mid-run — this still needs to be uncommented and filled in per-environment; see §10.

Corrections are never edits — `redeem.ts` and `anti-abuse.ts` both write compensating entries (`REDEEM_REVERSED`, `ORDER_REFUND_CLAWBACK`, `BONUS_VOIDED_ABUSE`) rather than touching a prior row.

`ensureLoyaltyAccount()` (`ledger.ts:131-155`) also does something not obviously "ledger" work: it materializes a customer's referral code as a real `promotion` row via `ensureReferralCoupon()` (`ledger.ts:164-188`), so the code behaves like any other coupon end to end — `resolvePromo` finds it, `couponRedemption` counts its uses, and it shows up in the admin Customer Coupons tab (§7). This call never throws (`ledger.ts:185-187`) — a customer must get their loyalty account even if the coupon row write fails for some reason.

---

## 3 · Earning

All earning math lives in `lib/points/rules.ts`, pure and fully covered by `__tests__/points-rules.test.ts`.

**Order curve** — `orderBasePoints(n)` (`rules.ts:48-53`), where `n` is the customer's lifetime paid-order count *including the order being awarded*:

| Orders 1–10 | Orders 11–49 | Orders 50+ |
|---|---|---|
| `750 - 50n` (700 → 250, descending) | 200 flat | 300 |

**Value tiers** (`rules.ts:65-71`) — non-cumulative, first match from high to low wins (`valueTierFor`, `rules.ts:73-75`):

| Floor (merchandise value) | Points | Perk |
|---|---|---|
| KSh 250,000 | 50,000 | VIP_2 ("Inner Circle") |
| KSh 100,000 | 20,000 | VIP_1 ("VIP") |
| KSh 50,000 | 5,000 | — |
| KSh 25,000 | 1,500 | — |
| KSh 15,000 | 1,000 | — |

Both curves are measured on `eligibleCents` (`rules.ts:82-88`) — merchandise value only, after every discount, **excluding delivery and excluding the cash portion paid with points**. The rules.ts header comment (lines 3-9) explains the second exclusion directly: if a customer could earn on the points-funded part of an order, a fully points-paid order would refill its own balance every cycle.

**Streaks** (`rules.ts:126-191`) — computed in ISO weeks and calendar months, both anchored to Africa/Nairobi via a fixed +3h offset (`rules.ts:99`; the comment at lines 93-96 notes Kenya has no DST, so a constant offset is exact without a timezone library):
- Every 4 consecutive weeks with a paid order → +500 points, capped at 4 lifetime awards (2,000 max).
- 26 consecutive weeks → +3,000, once.
- 6 consecutive months with at least one order → +2,000, once — but mutually exclusive with the 26-week weekly streak (`rules.ts:176-188`): a customer who bought every single week for six months gets 3,000, not 3,000 + 2,000.

**`award-order.ts`** (`awardPointsForOrder`, lines 117-200) orchestrates one order's award pass: loads the order (online `order` or `inStoreOrder`, keyed by `refType`), pulls a fresh `UserStats` snapshot, awards base + tier + any streak entries, and issues a single-customer VIP coupon (`issueVipCoupon`, lines 87-115) when the tier carries a `VIP_1`/`VIP_2` perk. `loadOrder()` (lines 50-84) is deliberately strict — a walk-in in-store order with no linked account (`customerUserId` is a bare string, no FK per line 80-81) simply earns nothing, rather than crashing.

**The worker** — `POST /api/admin/workers/award-points` (`app/api/admin/workers/award-points/route.ts`) is a QStash-delivered job, signature-verified (`verifyQstashRequest`, line 33). It runs the full award pipeline in a fixed order (comment at lines 44-46 explains why order matters: signup/referral bonuses must resolve before badges, since badge families key off `lifetimeEarned`):
`awardPointsForOrder` → `unlockJoiningBonus` → attach a late-linked referral code → award any coupon-carried points → `convertReferral` → `evaluateBadges` → write an inbox message and (if SMS is configured) an SMS with the total earned and new balance.

**Enqueue points:**
- `lib/payments/post-payment.ts:71` — inside `markPaymentSuccess()`, guarded by `if (result)` (line 70) so a duplicate callback that already hit the idempotency check earlier in the same function doesn't queue a second award pass.
- `lib/payments/instore-post-payment.ts:91-94` — inside `markInStorePaymentSuccess()`, guarded by `if (provider)` (line 90), the equivalent idempotency signal for the in-store flow. `.catch()`-wrapped so an enqueue failure never fails the payment-success path.

---

## 4 · Redemption

`lib/checkout/compute-totals.ts` is the single shared implementation of order-total arithmetic — its header comment (lines 1-10) states it replaced near-identical copy-pasted math across every payment-initiate route, and that redemption would otherwise have meant duplicating the new logic that many times over.

`applyPoints()` (lines 56-70) computes how many points may be spent against a given cash amount: it's capped by whichever is smallest of what the customer requested, what they have available, and what would exactly clear the bill (`Math.ceil(grossCents / CENTS_PER_POINT)`, line 66 — ceiling rather than floor so spending enough points can zero the bill outright instead of leaving an un-payable sub-40-cent remainder). `computeOrderTotals()` (lines 81-144) resolves the coupon first, then points, in that order — an invalid or expired coupon is swallowed silently (discount stays 0, matching prior behavior, line 111), but an attempt to spend more points than the balance holds is a hard `Err.validation` (lines 126-130), not a silent clamp — the comment at lines 76-79 explains why: a balance the customer can see on screen should never be silently overridden by the server.

**`lib/points/redeem.ts`** implements the debit-at-initiate / compensating-reversal-on-failure pattern its header comment lays out (lines 1-13):

- `holdRedeemedPoints()` (lines 27-43) — debits points the instant the order row is created, before payment confirms. This is deliberate, not an oversight: debiting at creation means the same balance can't be spent across two parallel checkouts.
- `releaseRedeemedPoints()` (lines 50-78) — the compensating entry (`REDEEM_REVERSED`) for an order that will never be paid. Idempotent through the same ledger unique-key mechanism, so it's safe to call from both a webhook callback and a timeout job without double-crediting.
- `reversePointsForRefund()` (lines 84-116) — for an order that *was* paid and is now refunded/cancelled: hands back spent points and claws back everything the order earned (`ORDER_BASE`, `ORDER_VALUE_TIER`, all three streak reasons) via `ORDER_REFUND_CLAWBACK`.

The module's own ponytail comment (lines 8-12) explains the design choice not to build a reservation table with a TTL sweeper: since the ledger is append-only regardless, a compensating entry is both the cheapest mechanism available and the one leaving the clearest audit trail, and `markPaymentFailed()` already runs on every failure path — including the timeout `DELETE` in `app/api/payments/status/[orderId]` — so there's no code path left that could leak a held balance.

**Checkout call sites.** `holdRedeemedPoints()` is called from **7** route files, not 8 — see §11 for the correction against the brief's count:

| Route | Line |
|---|---|
| `app/api/payments/mpesa/initiate/route.ts` | 197 |
| `app/api/payments/paystack/initialize/route.ts` | 203 |
| `app/api/payments/kcb/initiate/route.ts` | 187 |
| `app/api/payments/mock/checkout/route.ts` | 174 (dev-only; also calls `releaseRedeemedPoints` at 187) |
| `app/api/admin/orders/instore/mpesa/initiate/route.ts` | 272 |
| `app/api/admin/orders/instore/paystack/initialize/route.ts` | 268 |
| `app/api/admin/orders/instore/mpesa/c2b/claim/route.ts` | 252 |

`releaseRedeemedPoints()` is called from those same failure paths plus the two shared post-payment modules (`post-payment.ts:209`, `instore-post-payment.ts:230`).

---

## 5 · Badges & levels

`badge-families.ts` is pure configuration: `BADGE_FAMILIES` (lines 82-263) is a list of 20 families, each naming one `StatKey` field of `UserStats` (`stats.ts:20-51`) plus a `base` and `growth` rate. `generateBadgeCatalog()` (lines 315-360) expands that into `20 × TIERS_PER_FAMILY (50) = 1,000` `AUTO` badges — the file header (lines 1-16) is explicit that nobody hand-authors a thousand rows or writes a thousand evaluators; adding a family is a data change, and `pnpm seed:badges` regenerates the catalog. 8 additional `MANUAL_BADGES` (lines 270-279) round the total to 1,008 — matching the "badges 1008" figure cited in the incident diagnosis (§8.1).

Thresholds grow geometrically per family (`tierThreshold`, lines 76-78) and points per tier follow `tierPoints(tier) = round(15 × tier^2.6)` (lines 63-65) — steep enough that, per the file's own comment (lines 9-11), the catalog's total point value is a deliberately unreachable ceiling, not a target. Rarity bands (`tierRarity`, lines 67-74) run COMMON through MYTHIC by tier number; tiers past 30 are `hidden: true` (line 335) until a customer is close enough to see them.

**Why `badge.threshold` is `BigInt`** (`prisma/schema.prisma:1623`): the top tiers of the highest-growth families (e.g. `spend`, base 100,000 × 1.42^49) run to roughly `3 × 10^12` — well past the `~2.1 × 10^9` range of a 32-bit int, which is what the Prisma `Int` type maps to. `evaluate-badges.ts:30-33` documents the corresponding safety margin on the read side: every threshold in the catalog stays under `2^53` (JavaScript's safe-integer ceiling), so `Number(b.threshold)` (line 44) is lossless and the comparison against a `UserStats` field can stay ordinary arithmetic rather than needing `BigInt` comparison throughout.

`evaluateBadges()` (`evaluate-badges.ts:53-95`) loads the full `AUTO` catalog and the customer's already-held badges in two parallel queries, computes `qualifyingBadges()` (lines 34-47 — a badge qualifies if its stat value meets the threshold and it isn't already held), grants each newly-earned badge, credits its points (skipped for zero-point manual badges, which can't reach this path since `evaluateBadges` only evaluates `AUTO` grants), and recomputes level via `syncLevel()` (lines 97-102).

**Manual badges are worth zero points by design** (`badge-families.ts:265-269`): they are the only badges a super admin can hand-grant, and the comment states plainly why they carry no points — a hand-granted badge that paid points would be a second way to create points outside the unanimous grant flow (§6).

**Levels** (`levels.ts`) are driven by badge count, not point balance — the file header (lines 1-9) explains this directly: points are spendable, so a level tied to balance would drop when a customer *used* the loyalty program, punishing the behavior it's meant to reward. `LEVEL_THRESHOLDS` (lines 24-26) is a front-loaded power curve (exponent 1.8) over 100 levels, floored at `Math.max(i, ...)` so the raw curve — which rounds to zero for roughly the first dozen levels — doesn't collapse several levels onto "zero badges needed."

---

## 6 · Anti-farming

`lib/points/anti-abuse.ts` implements a two-layer defense, and its header comment (lines 1-20) states the design intent precisely: order points are never gated because they're backed by real money — nothing to farm there — and a shared IP alone never blocks, because families/offices/shared Wi-Fi are ordinary in Kenya and a false accusation costs more than tolerating a duplicate joining bonus.

**Layer 1 — locked bonuses.** The 4,000-point signup bonus (`SIGNUP_BONUS_POINTS`, `rules.ts:197`) and 500-point referred bonus (`REFERRED_BONUS_POINTS`, `rules.ts:198`) are written to the `lockedDelta` pot, unspendable until the customer's first successful payment (`grantJoiningBonus`, `referrals.ts:29-41`; `attachReferral`, `referrals.ts:56-115`). Creating an account is free; completing a real payment costs the price of the order.

**Layer 2 — signal scoring at unlock.** `unlockJoiningBonus()` (`anti-abuse.ts:216-274`) fires once, at the moment of first payment. It calls `collectOrderSignals()` (lines 125-169), which records up to four identity signals per account: normalized email, normalized phone, and — critically — the actual payment instrument. Weights (`WEIGHTS`, lines 35-42):

| Signal | Weight | Source |
|---|---|---|
| `PAY_MPESA` | 100 | Paying MSISDN, extracted from the gateway callback payload |
| `PAY_CARD` | 100 | Paystack `authorization.signature` — a stable card fingerprint, no PAN stored |
| `PHONE` | 80 | Account phone, E.164-normalized |
| `EMAIL_NORM` | 60 | Account email, Gmail-dot/plus-tag collapsed (`normalizeEmail`, lines 59-68) |
| `DEVICE` | 40 | Browser fingerprint from `fingerprint.ts` |
| `IP` | 15 | /24 subnet (`ipSubnet`, lines 71-76) |

`assessRisk()` (lines 99-119) sums the weight of every signal an account shares with a *different* account. `VOID_AT = 100` / `FLAG_AT = 15` (lines 45-46): at or above 100 the locked bonus is voided outright (`BONUS_VOIDED_ABUSE`) and a `PointsAbuseFlag` row is written plus an admin notification; between 15 and 100 the bonus still unlocks but is flagged for human review. One explicit exception (lines 232-233): if every shared signal on an account is `IP` and nothing else, the account is never voided regardless of score — a payment-instrument match alone gets you to 100 and voids; an IP match alone never does.

The M-Pesa MSISDN extraction (`findFirstString`, lines 175-204) is a small depth-first search rather than a fixed-path lookup, because the comment at lines 159-161 notes Daraja nests the phone under `CallbackMetadata` items while KCB and the C2B feed put it at the top level under varying key names — one function handles all three shapes.

Everything a raw value passes through is hashed before storage: `hashValue()` (lines 48-53) HMACs with `REDIS_CHANNEL_SECRET` (reused from the existing SSE-signaling secret, not a new env var) and truncates to 40 hex chars — the `identitySignal` table (`prisma/schema.prisma:1291-1303`) never holds a raw MSISDN, card fingerprint, email or phone.

**`referrals.ts`** enforces the payout timing directly in its header comment (lines 1-12): a referral pays out on the referred customer's *first paid order*, not at signup — otherwise the referral code becomes a second route to farm the same joining bonus the account-level gate above is designed to stop. `attachReferral()` (lines 56-115) refuses to attach if the new account has already paid for any order (`NOT_NEW`, lines 81-88) — the `ignoreOrderId` parameter (lines 60-64) exists specifically so the very order that's carrying the referral code, being paid for right now, doesn't disqualify itself. `MAX_REWARDED_REFERRALS = 5` (`rules.ts:200`) caps the referrer's payout, checked both at attach time (`CAP_REACHED`, `referrals.ts:90-93`) and again at conversion time (`referrals.ts:146-149`) since the cap could be reached by a different referral in between. The combined free-points ceiling — `4,000 signup + 500 referred + 5 × 1,000 referrals = 9,500` — is enforced once, centrally, inside `appendEntry()` (`ledger.ts:248-258`, `NON_PURCHASE_POINTS_CAP = 9500` at line 49) against the `NON_PURCHASE_REASONS` set (lines 42-46), not trusted to each individual caller.

---

## 7 · Admin & coupons

**`/admin/loyalty`** (`app/api/admin/loyalty/route.ts`) is explicitly read-only — the file header (lines 1-8) states there is deliberately no `PATCH`: admins can see every balance but the sole write path into the ledger is the grant flow below. `GET` returns programme-wide totals (outstanding points, the liability that balance represents in cents, lifetime earned/redeemed, orders paid with points, open abuse flags, pending grants) plus a searchable member list (lines 20-117).

**`/admin/loyalty/flags`** (`app/api/admin/loyalty/flags/route.ts`) lists `pointsAbuseFlag` rows and lets a permitted admin mark one reviewed. The header comment (lines 5-7) is explicit that reviewing a flag never restores a voided bonus — putting points back has to go through the same on-the-record, unanimous grant flow as any other hand-grant, not a side door on the flags screen.

**The unanimous grant flow — `lib/points/grants.ts`.** The header comment (lines 1-21) states the design goal directly: this is the *only* way points enter the system without a customer earning them, and it's deliberately awkward. Rules, all enforced in code:

- Only an active super admin may request (`createGrantRequest`, `grants.ts:52-106`, gated at lines 69-71).
- The requester's own request counts as their first approval (`grants.ts:92-95`, comment "Requesting is approving").
- Every *currently active* super admin must approve — the quorum in `settle()` (lines 142-235) is recomputed against `activeSuperAdmins()` (lines 38-48) on every vote, not snapshotted at creation. The module header (lines 15-18) explains why: snapshotting would deadlock a pending request the instant a voting super admin left the company.
- A single `REJECTED` vote kills the request outright (`grants.ts:161-174`), no further votes considered.
- Points come out of the *requester's* personal lifetime `pointsAllowance` (`adminProfile.pointsAllowance` / `pointsAllowanceSpent`), set once and never renewable by any UI or API — only a direct database `UPDATE` (comment, `grants.ts:13-14`). Both the request-time check (`grants.ts:73-77`) and the settle-time check (`grants.ts:196-201`) re-verify remaining allowance, since it could have shrunk from a different grant settling in between.
- Settlement is idempotent: `entry` comes back `null` if a concurrent settle already created the ledger row (the unique key wins the race), and the allowance is only debited when `entry` is non-null (`grants.ts:212-219`) — so a double-settle race cannot double-debit the requester even though it also cannot double-pay the target.

**Coupon tabs — Store vs. Customer.** The Store/Customer split is a single discriminator column: `promotion.ownerUserId` (`prisma/schema.prisma:1403-1407`) — `null` means a store coupon staff created by hand, non-null means a customer's own auto-created referral code. `GET /api/admin/promotions?scope=store|customer` (`app/api/admin/promotions/route.ts:22-65`) filters on that column and, for the customer scope, joins in the owning user's name/email/image in a second query (lines 45-52) since `promotion` lives in the `admin` Postgres schema and `user` in `public`, with no FK between the two schemas (comment, lines 42-44). `AdminPromotionsClient.tsx:41-42` renders the two as labeled tabs ("Store Coupons" / "Customer Coupons").

Customer coupons are read-only by design at the API layer, not just the UI: `PATCH /api/admin/promotions/[id]` explicitly rejects an edit when `ownerUserId !== null` (`app/api/admin/promotions/[id]/route.ts:52-57`, `Err.validation("Customer coupons can't be edited. Disable it instead.")`) — the comment there states the terms belong to the programme, not to an individual staff member to change.

**`pointsAward`** (`prisma/schema.prisma:1408-1410`) lets a coupon mint loyalty points on redemption, capped at `MAX_COUPON_POINTS = 3000` (`lib/promotions/schema.ts:14`) and gated by the same approval queue as every other coupon field — `lib/promotions/schema.ts`'s header (lines 1-9) is explicit that this validation didn't exist before ("POST hand-rolled three `if` checks and PATCH coerced whatever it was given") and had to be added specifically because a coupon can now mint points. The points are credited by the award-points worker at payment success (`award-points/route.ts:62-82`), not at checkout, so an abandoned order carrying a points-bearing coupon never pays out.

**Soft delete via `disabledAt`.** `DELETE /api/admin/promotions/[id]` (`app/api/admin/promotions/[id]/route.ts:83-115`) no longer hard-deletes. The comment (lines 76-81) explains why: `couponRedemption.couponId` is a bare string with no FK, so a hard delete used to orphan every redemption record pointing at that coupon and destroy the record of who used it. Disabling (`disabledAt`, `disabledByAdminProfileId`, `status: "inactive"`) is reversible and keeps the audit trail intact. A new `GET /api/admin/promotions/[id]/redemptions` route (untracked, `app/api/admin/promotions/[id]/redemptions/route.ts`) lists who redeemed a given coupon, joined against `user` in code for the same cross-schema reason as above, and links each row to that customer's admin drawer — which is what the new deep-link support in `AdminCustomersClient.tsx:538-548` (`?customer=` opens the drawer directly) exists to serve.

**`approvalStatus`** on `promotion` (`prisma/schema.prisma:1411-1413`) defaults to `APPROVED` so every pre-existing coupon keeps working untouched; only `PENDING` blocks redemption. The uncommitted `lib/approval-executors.ts` diff replaces a hand-typed field list in `"promotions:create"` with an explicit `PromotionPayload` type and adds a previously-missing `"promotions:update"` executor — the diff's own comment (added at the top of the create executor) states the reason for enumerating fields rather than spreading the payload: anything added to the promotion model and not listed there is silently dropped when a queued request is approved, and `maxDiscountKes` was in fact missing for exactly that reason before this change. The `"promotions:update"` executor didn't exist before this branch at all — its docstring states PATCH used to write straight to the database, meaning any role holding `promotions:update` could create a coupon with 0 points and edit points onto it afterward, bypassing the create-time approval gate entirely.

---

## 8 · Two production incidents

### 8.1 — `POINTS_LEDGER_SECRET` unset in staging

**Root cause.** `secret()` (`ledger.ts:67-79`) throws when `POINTS_LEDGER_SECRET` is unset *and* `NODE_ENV === "production"`. Every call to `entryHash()` — meaning every single `awardPoints()` call, with no exception — runs through `secret()`. With the variable unset, every award attempt threw. Every call site that invokes `awardPoints()` (`award-order.ts`, `evaluate-badges.ts`, `referrals.ts`, `anti-abuse.ts`, `grants.ts`) does so without letting the failure propagate to the customer — loyalty failures are designed to never block a payment or a signup — so the only visible symptom was customers paying and simply not earning anything, with no error surfaced anywhere a customer or admin would see it.

**Diagnostic evidence** (as reported by the incident owner): the badge catalog held its full 1,008 rows — matching the count generated by `generateBadgeCatalog()` in §5 — confirming `pnpm seed:badges` had run correctly and the schema itself was fine. Against that, only 2 `loyaltyPoints` accounts existed and the `pointsLedger` table held 0 entries, despite 16 paid orders having gone through in the same window. Zero ledger entries against 16 paid orders is consistent with every `awardPoints()` call failing at the same point — `secret()` throwing before any `pointsLedger.create()` is reached — rather than a partial or intermittent failure, which would be expected to leave at least some entries behind.

**The fix already in place.** `ledger.ts:60-65` now shouts at module load time in production if the variable is missing (`console.error`, not silent), rather than waiting for the first award attempt to discover it. `scripts/backfill-points.ts` (§9) exists specifically to replay the award pass for orders paid during the outage window, and its own header comment (lines 4-6) states this incident as the reason for its existence in exactly these terms. `scripts/backfill-points.ts:33-40` also refuses to run at all if `POINTS_LEDGER_SECRET` is still unset, with a comment warning that entries signed with a different key than the one eventually deployed would fail verification later.

### 8.2 — client component importing a server-only module

**Root cause.** A client component (`"use client"`) that imported anything from `ledger.ts`, `award-order.ts`, `redeem.ts`, `anti-abuse.ts`, `referrals.ts`, `referral-discount.ts`, `grants.ts`, `evaluate-badges.ts`, or `stats.ts` — even just for a constant like `CENTS_PER_POINT` — pulled `@/lib/db` into the browser bundle transitively, which pulls in the `pg` Postgres driver, which depends on Node built-ins (`dns`, `fs`, `net`, `tls`) that don't exist in a browser bundle. Turbopack surfaced this as 7 separate `Module not found` errors (one per missing Node built-in import reached through the dependency graph), not one clear message pointing at the actual mistake.

**Evidence this is the documented, deliberate fix rather than a guess.** Every server-only module in `lib/points/` now opens with the identical comment (verbatim in 8 files, cited in §1): *"Reaches the database. Importing this from a client component pulls the Postgres driver into the browser bundle — this makes that fail loudly at the import instead of as a wall of pg module-not-found errors."* `rules.ts:14-23` states the split existed specifically because of this: *"That is exactly what happened to /loyalty-points."* The current `/loyalty-points` page (`app/loyalty-points/page.tsx`) and its content component (`components/legal/LoyaltyPointsContent.tsx`) import nothing from `lib/points` today, consistent with the offending import having already been removed or replaced with a `rules.ts` import as part of the fix.

**Why `tsc --noEmit` didn't catch it.** `server-only` is a runtime marker package, not a type. `import "server-only"` has no type signature that flags a violation — TypeScript type-checks that the import resolves and stops there. The failure only manifests when a bundler actually tries to resolve the *transitive* dependency graph for a client-side chunk and hits a Node-only module inside `pg`; that only happens during `next build` / `pnpm build`, which runs the real bundler (Turbopack, per `next.config`), not during `tsc --noEmit`, which never bundles anything. This is a general property of the `server-only` package, not something specific to this codebase — the only way to catch this class of bug before deploy is a real build, which is why this incident is grouped with the operational runbook in §9 rather than treated as a one-off.

---

## 9 · Operational runbook

| Command | What it does | Source |
|---|---|---|
| `pnpm points:verify [userId]` | Re-walks one or every customer's chain via `verifyChain()`, reports any that don't reconcile, exits non-zero on failure (for CI/cron wrapping) | `scripts/verify-points-ledger.ts` |
| `pnpm points:backfill [--apply]` | Replays the award pass for every paid order, oldest-first (so the "your Nth order" curve and streak windows land the same as they would have at the time); dry-run by default, refuses to run without `POINTS_LEDGER_SECRET` set | `scripts/backfill-points.ts` |
| `pnpm points:backfill-coupons [--apply]` | Creates the missing `promotion` row for any `loyaltyPoints` account that predates `ensureReferralCoupon()`; dry-run by default | `scripts/backfill-referral-coupons.ts` |
| `pnpm seed:badges` | Regenerates the `badge` table from `badge-families.ts`, idempotent via stable slug IDs (`familyKey.tTIER`) | `prisma/seed-badges.ts`, `package.json:14` |
| `GET /api/admin/workers/verify-points` | The nightly (Vercel Cron, per `vercel.json:8`) equivalent of `points:verify` — same `verifyChain()` call, but raises a `CRITICAL` `LOYALTY_LEDGER_BREACH` notification plus a Sentry error on any break, rather than repairing anything. The route's own comment states why it never auto-repairs: "fixing" a balance silently would destroy the evidence of what happened | `app/api/admin/workers/verify-points/route.ts` |
| `prisma/sql/points-ledger-guard.sql` | Database-level append-only trigger; apply via `pnpm prisma db execute --file prisma/sql/points-ledger-guard.sql`. The commented-out `REVOKE`/`GRANT` block (lines 26-33) still needs the real app role name filled in per environment — not yet applied anywhere per this pass | `prisma/sql/points-ledger-guard.sql` |

**Required env vars:**

| Variable | Used by | Notes |
|---|---|---|
| `POINTS_LEDGER_SECRET` | `ledger.ts` (HMAC key for `entryHash`) | `.env.example:210`. Throws in production if unset (§8.1); falls back to a fixed dev string outside production (`ledger.ts:76`) |
| `REDIS_CHANNEL_SECRET` | `anti-abuse.ts:49` (identity signal hashing) | `.env.example:227`. Reused from the existing SSE-signaling secret, not a new variable added for this feature |
| `CRON_SECRET` | `verify-points/route.ts:26` | Bearer-auth gate on the nightly worker, standard pattern shared with other Vercel Cron routes in this codebase |

---

## 10 · Known gaps / open questions

Stated plainly, per the brief's instruction not to soften these:

1. **The legacy `POST /api/orders` route never got points wiring, on either side.** Confirmed by grep: it computes totals inline (`resolvePromoBase`, `subtotalKes + resolvedDeliveryKes - discountKes`, `app/api/orders/route.ts:151-162`) rather than through `computeOrderTotals()`, so `holdRedeemedPoints()` is never called — points redemption is not possible through this route. More significantly, this route also never enqueues the award-points worker itself (no `markPaymentSuccess` or direct `award-points` publish inside `app/api/orders/route.ts`), and a grep across `app/api/admin/orders/**` found only one file (`instore/mpesa/c2b/claim/route.ts`) that references points-award machinery at all — the ordinary admin order-status `PATCH` route does not. Whether orders created through this legacy route ever reach `paymentStatus: PAID` through some other confirmation path that *does* call `markPaymentSuccess()` was not traced in this pass; if they don't, orders from this route earn nothing at all, not just "no redemption."

2. **Several Zoho fields pushed alongside points-bearing orders remain unverified against a live receipt.** `pointsDiscountKes`, `pointsRedeemed`, `discountKes` are all forwarded to `pushSaleReceiptToZoho()` from both `post-payment.ts:133-135` and `instore-post-payment.ts:172-174`, but this pass did not check a live Zoho Books receipt to confirm those fields land where they're expected on Zoho's side — this was already flagged as an open item in the prior Zoho Books migration work (per project memory) and applies equally here since points redemption is one more source of `discountKes`/`pointsDiscountKes` reaching that push.

3. **The pre-existing failing test suites are unrelated to this build.** Per project memory, 9 route-handler test files (57 tests) fail against Next 16's `connection()` API, independent of any points-specific work. The points test suite itself (`__tests__/points-*.test.ts`, 7 files: `points-rules`, `points-ledger`, `points-redemption`, `points-anti-abuse`, `points-grants`, `points-referrals`, `points-invite-message`) was not run as part of this pass — their presence and scope was confirmed by reading file names and imports only, not by executing `pnpm test`.

4. **The commented-out `REVOKE`/`GRANT` block in `points-ledger-guard.sql`** (lines 26-33) has not been uncommented or applied to any environment as of this pass — the trigger alone is active (assuming the SQL file has been run at all, which was not independently verified against a live database), but the second layer that would additionally strip `UPDATE`/`DELETE`/`TRUNCATE` privileges from the application role is still inert.

5. **`loyaltyTier` remains in the schema** (`prisma/schema.prisma:1598-1607`) alongside the new points/level system, and `admin/loyalty/tiers` routes were listed as a live admin surface in the prior KYF-007 route inventory. Whether this is legacy/dead code that predates the points build, or a still-active parallel concept, was not determined in this pass — it's mentioned here only because it sits in the same schema section and its name could be mistaken for the new `loyaltyPoints.level` system.

---

## 11 · Corrections to the brief

- **§4's "8 checkout call sites"**: confirmed count is **7**, both for `holdRedeemedPoints()` and for `computeOrderTotals()` — the same 7 route files import both. See the table in §4.
