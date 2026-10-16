# KCB Buni Integration

Fechi Organics uses [KCB Buni](https://buni.kcbgroup.com/) for M-Pesa STK push on the Nairobi and Nakuru branches. Buni provides M-Pesa integration via KCB's developer portal.

## How it works

KCB Buni uses a similar OAuth + STK push flow to Safaricom Daraja:

1. Fetch an OAuth token using `Basic` auth (consumer key : consumer secret, base64-encoded)
2. Token is cached in Redis as `{token, expiresAt}` (`lib/payments/token-cache.ts`) with TTL = `expires_in - 300` seconds; a token with under 5 minutes left is re-minted, a short NX lock stops concurrent mints, and a Redis outage just means each push mints its own token
3. POST the STK push request (`/mm/api/request/1.0.0/stkpush`) with `apiKey` in the header and a signed `callbackUrl` (`?tx=&sig=`, see `lib/payments/callback-guard.ts`). KCB does not use a Daraja-style passkey
5. Safaricom delivers an STK prompt to the customer's phone
6. KCB posts the callback to `/api/payments/kcb/callback` with a Safaricom-compatible structure

## Branches using KCB Buni

- Nairobi (`mpesaGateway: KCB_BUNI`, `mpesaType: PAYBILL`)
- Nakuru (`mpesaGateway: KCB_BUNI`, `mpesaType: PAYBILL`)

All other branches use standard Daraja.

## Files

| File | Purpose |
|------|---------|
| `lib/payments/kcb/kcb-client.ts` | Token fetch + cache, STK push |
| `app/api/payments/kcb/initiate/route.ts` | POST — create order + trigger KCB STK push |
| `app/api/payments/kcb/callback/route.ts` | POST — KCB webhook, same structure as Daraja |

## Environment variables

```
KCB_BASE_URL=https://uat.buni.kcbgroup.com   # Sandbox only
KCB_CALLBACK_BASE_URL=https://xxxx.ngrok-free.app   # Public URL for callbacks
```

`KCB_BASE_URL` has **no default** — `lib/payments/kcb/kcb-client.ts` throws rather than
silently falling back to the UAT host. In production it must be the real Buni
production URL (contact KCB Buni support for it — see below); a missed env var
now fails loudly at request time instead of accepting the STK push, returning
success, and never ringing a real handset (`1037: DS timeout user cannot be
reached` with no prompt ever received). `lib/payments/gateway-env.ts`'s
`assertGatewayEnv()` also refuses to start a request on a production deploy
(`NODE_ENV=production` and `APP_STAGE` unset/`"production"` — see `.env.example`)
if this still looks like a sandbox host. Set `APP_STAGE=staging` on the
staging deploy so it can use the UAT host and sandbox credentials.

## Branch credentials (stored encrypted in DB)

| Field | Description |
|-------|-------------|
| `consumerKeyEnc` | KCB Buni consumer key (encrypted) |
| `consumerSecretEnc` | KCB Buni consumer secret (encrypted) |
| `passkeyEnc` | M-Pesa passkey (encrypted) |
| `apiKeyEnc` | KCB Buni API key (encrypted) — required for KCB_BUNI gateway |

These are updated via the admin panel or direct DB update. The seed populates them with `encrypt("PLACEHOLDER")`.

## Production URLs

| Environment | Base URL |
|-------------|---------|
| UAT / sandbox | `https://uat.buni.kcbgroup.com` — accepts pushes but has been observed NOT to call back |
| Production | Contact KCB Buni support for the production base URL |

## Dispatch

The M-Pesa initiate route (`/api/payments/mpesa/initiate`) checks `branch.mpesaGateway` and automatically dispatches to KCB Buni for branches configured with `KCB_BUNI`. The frontend only calls one route — gateway selection is transparent.
