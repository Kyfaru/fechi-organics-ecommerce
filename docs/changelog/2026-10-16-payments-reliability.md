# 2026-10-16 — Payments reliability overhaul (M-Pesa / KCB Buni)

Branch: `staging`. Eight commits below, plus this documentation commit. Design and operation reference:
`docs/payments-reliability.md`. Launch checklist: `docs/payments-go-live.md`.

Factual record of what changed, how it was checked and what was not. Nothing here was confirmed against production.

## 1 · Summary

Triggered by a paid in-store order (KCB UAT) that never confirmed. Investigation showed the system depended entirely on a
single callback with no record of receipt, a timeout that failed orders without asking the gateway, a worker that prompted
the wrong phone, and non-atomic success handling. Work was done in five phases from a written review.

## 2 · Commits

| Commit | Date | Scope | Size |
|---|---|---|---|
| `2c75cf2` | 10-16 | Shared token cache (refresh-ahead, mint lock); log KCB stkpush response | 6 files, +141/−35 |
| `888c205` | 10-16 | Phase 0 — token cache fail-open, timeout ⇒ `sentNothing=false`, SSE one-shot frame, PII log removed, tab-switch cooldown fix, `/api/health/live`, HEALTHCHECK, CI | 13 files, +130/−28 |
| `755e616` | 10-16 | Phases 1+2 — callback inbox, signed callback URLs, amount check, atomic claim, `payerPhone`, watchdog at creation, late recovery, hook status fallback, idempotency key | 17 files, +557/−129 |
| `ac347b2` | 10-16 | Phase 3 — `after()` dispatch fast path (`run-dispatch-job`), parallel reads, explicit pool, latency probe, recheck fixes | 11 files, +305/−196 |
| `8fe8c57` | 10-16 | Phase 4 — neutral C2B URLs, fake-KCB simulator, k6 storm script, go-live checklist, README drift, in-store hook reconnect, idempotency race, UUID fallback | 13 files, +298/−18 |
| `a3e6765` | 10-16 | Resend cooldown starts on cancel/failure; Try Again clears it; closing the error modal drops the attempt; stale-status reset in the in-store stream hook | 2 files, +34/−6 |
| `51c27e0` | 10-16 | Health route: remove `export const dynamic` (build error under `cacheComponents`), use `connection()` | 1 file, +6/−3 |
| `63de2fa` | 10-16 | Amount check compares within 1 KES (a KES 0.85 order is pushed as KES 1 and was rejected) | 2 files, +12/−3 |

## 3 · Behaviour changes worth knowing before deploying

1. **Schema must be applied first** (`pnpm prisma db push`): `transaction.payerPhone`, `transaction.idempotencyKey`, `paymentCallbackInbox`.
2. A callback whose amount differs by ≥ 1 KES is **not** auto-confirmed (stays PENDING, admin notification).
3. A payment arriving after our timeout job has failed the order is now **recovered to PAID** (previously ignored).
4. Duplicate callbacks no longer re-send confirmation emails or admin alerts.
5. Timeouts on the STK request no longer fail over to the other gateway.
6. The STK prompt goes to the number typed for M-Pesa, not the contact phone.
7. Signature enforcement ships **off**; callbacks with a bad signature are processed and flagged.

## 4 · Defects found in my own earlier work during re-checks (all fixed)

| Found | Fix |
|---|---|
| Duplicate callbacks still published confirmation/admin emails | Fan-out only for the claim winner |
| A failed attempt's idempotency key trapped a retry on the dead order | Key freed when its transaction is FAILED/TIMEOUT |
| Same-key race loser returned 500 and orphaned an order holding points | Loser fails its order, releases points, returns the winner's |
| In-store stream hook reported FAILED on a dropped connection | Reconnects; ends as `timeout` |
| `crypto.randomUUID()` throws on non-secure origins | Fallback generator |
| Token cache waited 1.5 s on a Redis error | Error ≠ contention |
| Amount check rejected whole-KES-rounded payments | Tolerance of 1 KES (`63de2fa`) |
| `export const dynamic` broke the Vercel build | `connection()` (`51c27e0`) |

## 5 · Verification

| Check | Result |
|---|---|
| Payment suites (14 files) | **127 / 127 pass** |
| Full suite | 357 pass, **57 fail in 9 files — identical to the 2026-07-29 baseline** (stale Next 16 test harness); no new failures |
| `pnpm tsc --noEmit` | clean |
| ESLint on touched payment code | clean except `hooks/use-payment-stream.ts:22` (`set-state-in-effect` on the `connecting` reset — present before this work) |
| Live (stage) | Observed 2026-10-16: callback received ~11 s after push and processed; amount mismatch on an 85-cent order reproduced the rounding bug that `63de2fa` fixed |

**Not verified:** any of this on a real handset in production; the React hooks and `MpesaPromptPanel` (no component tests);
the `after()` fast path under Vercel's `maxDuration`; that KCB preserves the `?tx=&sig=` query string; the PR #31/#32 merge
effects on stage.

## 6 · Added files

`lib/payments/callback-guard.ts`, `token-cache.ts`, `run-dispatch-job.ts` · `app/api/hooks/c2b/*` · `app/api/health/live` ·
`app/api/admin/diagnostics/latency` · `scripts/payments/fake-kcb.mjs`, `callback-storm.k6.js` · `.github/workflows/ci.yml` ·
`docs/payments-reliability.md`, `docs/payments-go-live.md` · tests: `token-cache`, `callback-guard`, `payment-claim`,
`kcb-callback`, `payments-stream-status`.

## 7 · Open items

See `docs/payments-reliability.md` §7. Highest priority: raise initiate `maxDuration` for the `after()` fast path on Vercel;
guard Zoho receipt pushes outside production; obtain KCB's status-query API to build a real reconciler.
