# Payments go-live checklist

Run top to bottom on the target environment. Items marked (KCB) need an answer
from KCB Buni in writing; they are open questions, not assumptions.

## Config
- [ ] `KCB_BASE_URL` is the PRODUCTION Buni URL (not `uat.`/`sandbox`); `APP_STAGE` unset or `production`
- [ ] `KCB_CALLBACK_BASE_URL` / `MPESA_CALLBACK_BASE_URL` are public https, not ngrok/localhost
- [ ] Branch rows hold production consumer key, secret and apiKey (never the UAT ones)
- [ ] `PAYMENT_CALLBACK_SECRET` set (falls back to `BETTER_AUTH_SECRET`)
- [ ] Prod Redis is separate from dev/stage (token cache keys are scoped, branch ids are not)
- [ ] `DB_POOL_MAX` decided against Neon's pooler limit; scale-to-zero decision recorded

## Schema
- [ ] `pnpm prisma db push` applied (transaction.payerPhone, idempotencyKey, paymentCallbackInbox)

## Callback hardening
- [ ] One stage callback logged with NO `bad signature` line, then set `PAYMENT_CALLBACK_ENFORCE_SIG=1`
- [ ] C2B URLs registered with neutral paths `/api/hooks/c2b/{confirmation,validation}`, https (production allows one registration per shortcode)
- [ ] (KCB) callback source IPs or a signature scheme
- [ ] (KCB) callback retry policy; STK status-query endpoint; TPS limit per consumer key

## Ops
- [ ] CI green on the release commit; previous image tag kept in Coolify for rollback
- [ ] `/api/health/live` answers 200; container HEALTHCHECK healthy
- [ ] `GET /api/admin/diagnostics/latency` p50 db < 10ms, redis get < 5ms (same region)
- [ ] Nightly jobs (cleanup-notifications, verify-points) scheduled somewhere that really runs on Coolify
- [ ] Sentry alert on payment error rate; `paymentCallbackInbox` rows with outcome `amount_mismatch`/`error`/null reviewed daily

## Money tests (KES 10, one per branch, real phone)
- [ ] Online STK: order PAID, modal flips, receipt on Zoho, one confirmation email
- [ ] In-store STK: modal flips, order PAID, invoice sends
- [ ] Cancel on handset (1032): order FAILED, points released
- [ ] No-PIN timeout: order FAILED at 5/15 min; paying AFTER that recovers to PAID (late recovery)
- [ ] Double-click Pay: one order, one prompt
- [ ] Tab switch Prompt/Live: cooldown and waiting modal survive

## Simulate without money
`node scripts/payments/fake-kcb.mjs` + `KCB_BASE_URL=http://localhost:4010` (scenarios by phone's last digit,
see the script header); `k6 run scripts/payments/callback-storm.k6.js` for the duplicate-callback storm.
