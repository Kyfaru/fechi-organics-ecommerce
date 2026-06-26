# Payments

This directory contains all payment gateway integrations for Fechi Organics.

## Architecture

Fechi Organics supports two checkout payment paths:

1. **M-Pesa STK Push** — for Kenyan customers (via Daraja or KCB Buni, dispatched by branch)
2. **Card (Paystack)** — for international customers and Kenyan card holders

### Branch dispatch

Each branch has an `mpesaGateway` field:
- `DARAJA` — standard Safaricom Daraja API (Till or PayBill)
- `KCB_BUNI` — KCB Buni M-Pesa API (Nairobi and Nakuru branches)

When a customer initiates M-Pesa payment, `POST /api/payments/mpesa/initiate` resolves their branch and dispatches to the correct gateway transparently.

### International orders

International customers (`country !== "KE"`) are routed to the Nairobi main branch (`isMain: true`) for Paystack payments. The branch resolver also has an `isInternational` opt flag that routes to the main branch for M-Pesa fallback.

## Gateway files

| File | Purpose |
|------|---------|
| `mpesa/daraja-client.ts` | Daraja OAuth token cache + fetch |
| `mpesa/stk-push.ts` | Daraja STK push request builder |
| `kcb/kcb-client.ts` | KCB Buni token cache + STK push |
| `branch-resolver.ts` | 4-tier branch resolution (zone → county → nearest → any) |
| `post-payment.ts` | `markPaymentSuccess` / `markPaymentFailed` — shared outcome handlers |
| `haversine.ts` | Great-circle distance for nearest-branch fallback |

## API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/payments/mpesa/initiate` | POST | Initiate STK push (Daraja or KCB, auto-dispatched) |
| `/api/payments/mpesa/callback` | POST | Daraja webhook (always returns 200) |
| `/api/payments/kcb/initiate` | POST | Initiate KCB STK push directly |
| `/api/payments/kcb/callback` | POST | KCB Buni webhook (always returns 200) |
| `/api/payments/paystack/initialize` | POST | Initialize Paystack transaction, returns `authorization_url` |
| `/api/payments/paystack/verify` | GET | Paystack return URL handler — verifies and redirects |
| `/api/payments/paystack/webhook` | POST | Paystack background safety-net webhook |
| `/api/payments/status/[orderId]` | GET | Polling endpoint for M-Pesa status (3s intervals, 90s timeout) |
| `/api/payments/mock/checkout` | POST | Demo checkout — for local testing without real payment credentials |

## Local development callbacks (ngrok)

M-Pesa and KCB require a public HTTPS URL to deliver callbacks. Paystack redirects the user back to your callback URL. Use ngrok during local development:

1. Install ngrok: https://ngrok.com/download
2. Run: `ngrok http 3000`
3. Copy the HTTPS URL (e.g. `https://abc123.ngrok-free.app`)
4. Set in `.env.local`:
   ```
   MPESA_CALLBACK_BASE_URL=https://abc123.ngrok-free.app
   KCB_CALLBACK_BASE_URL=https://abc123.ngrok-free.app
   PAYSTACK_CALLBACK_BASE_URL=https://abc123.ngrok-free.app
   ```
5. In Paystack dashboard → Settings → Webhooks: add `https://abc123.ngrok-free.app/api/payments/paystack/webhook`
6. Restart the dev server after changing env vars

> **Note:** ngrok URL changes on each restart unless you have a paid static domain.

## Branch credentials

All M-Pesa credentials (consumer key, consumer secret, passkey, KCB API key) are stored encrypted in the database using AES-256-GCM (`lib/crypto.ts`). The `BRANCH_SECRET_ENCRYPTION_KEY` env var (64 hex chars = 32 bytes) must be set.

`paystackSubaccount` codes are **not** encrypted — they are not secrets and are visible in the Paystack dashboard.

## Idempotency

All webhook handlers check `transaction.status !== "PENDING"` before processing. If already processed, they return 200 immediately without re-running `markPaymentSuccess`.

## Discount / promo codes

Use `resolvePromo(promoCode, subtotalKes)` from `lib/promo.ts` for all discount calculations. Never hardcode promo codes in payment routes. The function:
- Validates against the `promotion` DB table
- Checks date range and usage limits
- Returns `{ discountKes, deliveryFree }`
- Throws `Err.validation()` on invalid/expired codes (catch → discount = 0)
