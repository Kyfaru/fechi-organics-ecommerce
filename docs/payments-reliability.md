# Payments reliability layer

Reference for the M-Pesa reliability work done 2026-10-15 → 2026-10-16 on `staging`
(KCB Buni is the live gateway; Daraja is switched off). Covers what each piece does, where it lives,
the env vars it adds, how to operate it, and how it is tested. The pre-launch checklist is
`docs/payments-go-live.md`; the dated factual record is `docs/changelog/2026-10-16-payments-reliability.md`.

## 1. The problem this solved

| Symptom | Root cause |
|---|---|
| Customer paid, order stayed PENDING, no success modal | Callback never arrived or never matched; nothing recorded proof of receipt; the 5/15-min timeout then marked the order FAILED even if money had moved |
| First STK push slow / timing out | Token minted inside the push path; no per-stage timing to see where the time went |
| Prompt went to the wrong phone | Worker re-read `order.deliveryPhone`, ignoring the number typed for M-Pesa |
| Duplicate side effects | Success path was check-then-update, not atomic; duplicate callbacks re-sent emails |
| Modal froze / showed "failed" while a payment was live | Stream hooks gave up after 3 SSE errors; finished orders answered JSON to an `EventSource` |
| Resend button re-enabled while a prompt was live | Panel unmounted on tab switch, wiping cooldown + pending order |

## 2. Architecture (after)

```
Pay / Send prompt
  initiate route ─ validate, create order + transaction(PENDING, payerPhone, idempotencyKey)
        ├─ schedule watchdog (QStash, delayed)            ← BEFORE dispatch
        ├─ publish dispatch job (QStash)                  ← durable copy
        └─ after(): runDispatchJob()                      ← fast path, same NX claim
  runDispatchJob ─ Redis NX claim → dispatchStk (KCB) → persist checkoutRequestId → Redis "stk_sent"
  KCB ──callback──▶ /api/payments/{kcb|mpesa/instore}-callback
        1. file raw payload in paymentCallbackInbox          (durable proof)
        2. verify ?tx=&sig= (HMAC); match by checkoutRequestId, else signed tx id
        3. verify paid amount (within 1 KES)
        4. markPaymentSuccess / markInStorePaymentSuccess    (atomic claim)
        5. Redis "paid" signal FIRST, then side-effect publishes (allSettled)
  Browser SSE (/api/payments/stream, /api/admin/orders/instore/stream) → modal
  Safety nets: watchdog → FAILED("timed out") ; late callback → recovered to PAID
```

Rules the design follows: ack first, think later · the database decides (compare-and-set) ·
never discard a maybe-paid payment silently · every fast path has a slow safety net ·
Redis is a messenger, never the record.

## 3. Change reference

### 3.1 Callback hardening — `lib/payments/callback-guard.ts`
| Piece | Behaviour |
|---|---|
| `fileCallback` / `settleCallback` | Insert the raw callback into `paymentCallbackInbox` (`dedupeKey = source:checkoutRequestId:resultCode`) before any logic; stamp an `outcome` afterwards. Never throws. |
| `signedCallbackUrl(url, txId)` | Appends `?tx=<id>&sig=<hmac>`; unchanged URL when no secret configured. |
| `verifySignature` | `null` = nothing to check, `true/false` = checked (timing-safe). |
| `amountMatches(paidKes, expectedCents)` | True when within **1 KES**. The push is sent in whole KES (`kcb-client` rounds cents/100), so a KES 0.85 order legitimately settles as KES 1. Missing `Amount` is not a mismatch. |
| Enforcement | **Off by default.** A bad signature is logged and recorded (`hmacOk=false`). Set `PAYMENT_CALLBACK_ENFORCE_SIG=1` only after a stage callback is seen carrying the query string (KCB behaviour unverified). |

Inbox `outcome` values: `processed`, `duplicate`, `unknown_ref`, `amount_mismatch`, `rejected_signature`, `error`.
A row with `outcome IS NULL` older than a minute means the handler died mid-processing.

### 3.2 Atomic claim + late recovery — `lib/payments/post-payment.ts`, `instore-post-payment.ts`
- Success is `updateMany({ where: { id, status } , data: { status: "SUCCESS" } })`; only `count === 1` proceeds to stock,
  points, emails. A concurrent duplicate is a no-op.
- **Late recovery:** a transaction in `FAILED` whose `failureReason` contains "timed out" is recoverable. The order flips
  to PAID, redeemed points are re-held, and (online) admins get a "Late payment recovered" notification. A gateway-declined
  failure (e.g. `1032`) is never recovered.
- Only the claim winner fans out confirmation email / admin alert / invoice / points.
- The Redis success signal is written before the side-effect publishes; in-store invoice pre-generation is no longer
  awaited inside the callback.

### 3.3 Dispatch — `lib/payments/run-dispatch-job.ts`
Job body extracted from the QStash worker so two entry points share one Redis NX claim (`stk_dispatch:<txId>`, 300 s):
the worker (`/api/admin/workers/dispatch-stk`) and an `after()` fast path in both initiate routes. The prompt goes to
`transaction.payerPhone ?? order.deliveryPhone`. The KCB callback URL is signed per transaction.

### 3.4 Token cache — `lib/payments/token-cache.ts`
`{token, expiresAt}` in Redis, re-minted within 5 min of expiry, 10 s NX mint lock, legacy bare-string entries re-minted,
**Redis failures fall through to minting** (cache is an optimisation, never a dependency). Used by `kcb-client` and
`daraja-client`.

### 3.5 Timeout semantics — `kcb-client.ts`, `stk-push.ts`
A timeout/abort on the STK request is `sentNothing=false` (the request may have reached the gateway), so it never
triggers a failover to the other gateway. DNS/connect failures stay `true`. `kcb-client` logs per-stage timing:
`[kcb-client] timing — tokenMs=… stkpushMs=… status=…` and the successful response body.

### 3.6 Initiate routes
- Online (`app/api/payments/mpesa/initiate`): stores `payerPhone`; `idempotencyKey` (same key → same order; a FAILED/TIMEOUT
  attempt frees its key; a same-key race loser fails its own order and returns the winner's); pricing + branch resolve
  concurrently with cart/identity; watchdog scheduled at creation; a *throwing* dispatch publish falls back to inline dispatch.
- In-store (`app/api/admin/orders/instore/mpesa/initiate`): watchdog at creation, publish-failure fallback, signed callback URL,
  PII body log removed.
- `createWithRetryableOrderNumber`: 6 attempts (was 3).

### 3.7 Client behaviour
| Where | Change |
|---|---|
| `hooks/use-payment-stream.ts` | After >3 SSE errors, poll `GET /api/payments/status/<orderId>` for 3 min instead of reporting failure; `timeout` (not `failed`) if unresolved |
| `hooks/use-instore-payment-stream.ts` | Dropped connection reconnects (6 s apart, ≤20×) and ends as `timeout`, never `failed`; status resets to `idle` when the modal closes (no replay of a stale failure on Try Again) |
| `app/api/payments/stream/route.ts` | Finished orders answer a `text/event-stream` frame, not JSON |
| `PaymentStep.tsx` | Prompt/Live panels stay mounted (hidden) so cooldown + pending order survive tab switches |
| `MpesaPromptPanel.tsx` | Button inactive (no countdown) while the PIN modal is open; 30 s cooldown starts on cancel/failure; Try Again clears it; closing the error modal drops the finished attempt |
| `DeliveryClient.tsx` | One idempotency key per Pay attempt; success redirect 1500 → 500 ms; `randomUUID` fallback for non-secure origins |

### 3.8 Ops
| Item | Where |
|---|---|
| Liveness probe | `GET /api/health/live` (no DB; uses `connection()` — `export const dynamic` is rejected under `cacheComponents`). Dockerfile `HEALTHCHECK` uses it; `/api/health` stays the readiness probe. |
| Latency probe | `GET /api/admin/diagnostics/latency?n=15` (super-admin): DB and Redis p50/p95/max from the deployed app |
| Pool | `lib/db.ts`: `max = DB_POOL_MAX ?? 10`, 10 s connect timeout |
| Neutral C2B URLs | `/api/hooks/c2b/{confirmation,validation}` alias the original handlers; the register route now sends them; `/api/hooks` is public in `proxy.ts` |
| CI | `.github/workflows/ci.yml`: install, `prisma generate`, `tsc --noEmit`, payment test suites only (see §6) |
| Simulator | `scripts/payments/fake-kcb.mjs` |
| Load | `scripts/payments/callback-storm.k6.js` |

## 4. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PAYMENT_CALLBACK_SECRET` | falls back to `BETTER_AUTH_SECRET` | HMAC key for callback URL signatures |
| `PAYMENT_CALLBACK_ENFORCE_SIG` | unset (off) | `1` = reject callbacks with a bad signature |
| `DB_POOL_MAX` | `10` | pg pool size |
| `KCB_BASE_URL`, `KCB_CALLBACK_BASE_URL`, `MPESA_CALLBACK_BASE_URL` | — | unchanged; see `lib/payments/kcb/README.md` |

**Schema (additive, apply with `pnpm prisma db push` — `migrate dev` is broken, see memory):**
`transaction.payerPhone`, `transaction.idempotencyKey @unique`, model `paymentCallbackInbox`.
Deploy the schema **before** the code: the code selects/writes these columns.

## 5. Operating it

**An order is paid but still PENDING**
1. `paymentCallbackInbox` for the order's `checkoutRequestId`: no row → the gateway never called back (UAT behaves this way);
   `unknown_ref` → ID mismatch (compare logged `merchantRequestId`); `amount_mismatch` → real amount difference, reconcile manually;
   `error` / null outcome → handler failed, read the logs.
2. To replay: POST the stored `rawPayload` to the callback URL. Safe: the claim makes it idempotent, and a
   timeout-failed transaction is recovered.

**First push slow** — read `[kcb-client] timing`: high `tokenMs` = token mint/cache; high `stkpushMs` = gateway.
Check `/api/admin/diagnostics/latency` for DB/Redis distance.

**Simulate without money** — `node scripts/payments/fake-kcb.mjs`, then run the app with
`KCB_BASE_URL=http://localhost:4010` and `APP_STAGE=staging`. The phone number's **last digit** selects the scenario:
`0` success · `1` cancelled (1032) · `2` never calls back · `3` duplicate callback · `4` wrong amount · `5` late (25 s) · `6` gateway 500.

## 6. Test matrix

Payment suites (14 files, 127 tests, all passing):

| File | Covers |
|---|---|
| `token-cache.test.ts` | cache hit, near-expiry re-mint, legacy entry, fresh bypass, Redis-down |
| `callback-guard.test.ts` | signature round-trip/forgery, no-secret URL, amount tolerance incl. 85¢→KES 1 |
| `payment-claim.test.ts` | atomic claim winner/loser, timeout-failed recovery, declined not recovered |
| `kcb-callback.test.ts` | success, amount mismatch, rounding, missing Amount, duplicate, late-on-FAILED, unknown ref, signed tx fallback, forged signature, enforcement, cancel |
| `payments-stream-status.test.ts` | one-shot SSE frame for PAID/FAILED, 403, status GET (200/404/400) |
| `kcb-client.test.ts`, `daraja-client.test.ts`, `stk-push.test.ts` | token + push classification incl. timeout ⇒ `sentNothing=false` |
| `dispatch-stk*.test.ts`, `finalize-stk-dispatch.test.ts` | dispatch, failover rules, persist + signal |
| `instore-mpesa-callback.test.ts` | Daraja- and KCB-shaped in-store callbacks |
| `mark-payment-failed.test.ts`, `zoho-post-payment-branch.test.ts` | failed path; Zoho branch attribution under the new claim |

**Known failures (pre-existing, unrelated):** the full suite has 57 failing tests in 9 files from the stale Next 16
`connection()`/`headers()` test harness (admin orders, blog, login/signup integration, zoho-webhook, `orders`,
`instore-receipts`, 3 C2B-claim tests in `instore-payments`). The count is identical to the 2026-07-29 baseline, so nothing regressed.
CI therefore runs the payment suites only; widen it once the harness is repaired.

**Not covered by automated tests:** the two stream hooks and `MpesaPromptPanel` (no React component test setup for them);
the `after()` fast path; the initiate routes end-to-end; real KCB behaviour. These need the manual checks below.

### Manual verification (stage, after `db push` + deploy)
1. One in-store prompt → logs show `timing`, `persisted checkoutRequestId`, a callback `Processed` line; inbox row `processed`.
2. Cancel on handset (1032) → FAILED, points released; **Try Again** re-prompts immediately, no instant "failed" flash.
3. Let a prompt time out, pay after → order recovered to PAID.
4. Switch Prompt ⇄ Live during the cooldown/PIN modal → state survives; button inactive during PIN, 30 s starts on cancel/failure.
5. Order with cents in the price (e.g. KES 1250.50) → confirms (rounding tolerance).
6. `GET /api/health/live` → 200; `GET /api/admin/diagnostics/latency` (super-admin) → sane p50.

## 7. Known limits and open items

- **No gateway reconciler.** No KCB STK status-query endpoint is known; without it the system relies on callbacks plus the
  inbox/late recovery. Ask KCB (see `docs/payments-go-live.md`).
- **`after()` and `maxDuration`.** On Vercel, background work is cut at the route's `maxDuration` (initiate routes: 15 s) while
  a dispatch can take ~25 s. If cut off, the claim blocks the QStash retry for 300 s and the watchdog fails the order.
  Raising `maxDuration` to 60 on both initiate routes is recommended. On Docker/Coolify there is no such limit.
- **Late recovery matches on the failure text** ("timed out"). New timeout wording elsewhere would bypass it.
- **Amount-mismatch payments** stay PENDING (admin notified) and the watchdog later fails them; reconcile manually.
- **Signature enforcement** is off until verified against KCB.
- **Online stock** still decrements the deprecated `product.stock` row by row (needs an owner decision).
- **Order-number collision** is mitigated (6 retries), not eliminated.
- **Daraja callback** (`/api/payments/mpesa/callback`) is not hardened; do so before enabling Daraja.
- **Zoho:** sales-receipt pushes have no environment guard and no "already pushed" check — a stage deployment linked to the real
  Zoho organisation creates real receipts for test orders. Recommended: skip when `APP_STAGE` is not production.
- **Order of rollout:** schema first, then code; set `PAYMENT_CALLBACK_ENFORCE_SIG` last.
