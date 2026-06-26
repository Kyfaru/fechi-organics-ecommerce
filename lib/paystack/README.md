# Paystack Integration

Fechi Organics uses [Paystack](https://paystack.com/) for card payments (Visa, Mastercard, bank transfers).

## How it works

1. Customer selects "Credit / Debit Card" on the payment page
2. Frontend calls `POST /api/payments/paystack/initialize`
3. Server creates an order + transaction, calls Paystack API, returns `authorization_url`
4. Frontend redirects the user to `authorization_url` (Paystack hosted checkout page)
5. After payment, Paystack redirects to `GET /api/payments/paystack/verify?reference=xxx`
6. Server verifies the payment and redirects to `/order-success/[orderId]` or `/order-error/[orderId]`
7. As a background safety net, Paystack also POSTs to `/api/payments/paystack/webhook`

## Subaccounts

Each branch has a Paystack subaccount (`paystackSubaccount` field on `branch` model). When a transaction is initialized, the `bearer: "subaccount"` and `transaction_charge: 0` options route the full payment to the branch subaccount.

International orders are routed to the main branch (`isMain: true` — Nairobi).

## Files

| File | Purpose |
|------|---------|
| `lib/paystack/client.ts` | `initializeTransaction`, `verifyTransaction` — native fetch, no SDK |
| `lib/paystack/types.ts` | TypeScript types for Paystack API responses |
| `app/api/payments/paystack/initialize/route.ts` | POST — creates order + calls Paystack init |
| `app/api/payments/paystack/verify/route.ts` | GET — return URL, verifies and redirects |
| `app/api/payments/paystack/webhook/route.ts` | POST — HMAC-SHA512 verified safety-net webhook |

## Environment variables

```
PAYSTACK_SECRET_KEY=sk_test_...          # From Paystack dashboard → Settings → API Keys
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...   # Public key (not used server-side currently)
PAYSTACK_CALLBACK_BASE_URL=https://xxxx.ngrok-free.app  # Base URL for verify redirect

# One subaccount code per branch (from Paystack dashboard → Subaccounts)
PAYSTACK_SUBACCOUNT_NAIROBI=ACCT_...
PAYSTACK_SUBACCOUNT_NAKURU=ACCT_...
PAYSTACK_SUBACCOUNT_MWEA=ACCT_...
PAYSTACK_SUBACCOUNT_ELDORET=ACCT_...
PAYSTACK_SUBACCOUNT_KITENGELA=ACCT_...
```

## Webhook security

The webhook handler verifies the `x-paystack-signature` header using HMAC-SHA512 with `PAYSTACK_SECRET_KEY`. It reads the raw body before parsing JSON to ensure signature integrity. Requests with invalid signatures return 401.

## Setup checklist

- [ ] Create a Paystack account at https://paystack.com/
- [ ] Create a subaccount for each branch at https://dashboard.paystack.com/#/subaccounts
- [ ] Copy the subaccount codes to `.env.local`
- [ ] Copy API keys to `.env.local`
- [ ] Register webhook URL: `https://yourdomain.com/api/payments/paystack/webhook`
- [ ] Set `PAYSTACK_CALLBACK_BASE_URL` to your public domain or ngrok URL
