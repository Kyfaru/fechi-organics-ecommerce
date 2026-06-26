# KCB Buni Integration

Fechi Organics uses [KCB Buni](https://buni.kcbgroup.com/) for M-Pesa STK push on the Nairobi and Nakuru branches. Buni provides M-Pesa integration via KCB's developer portal.

## How it works

KCB Buni uses a similar OAuth + STK push flow to Safaricom Daraja:

1. Fetch an OAuth token using `Basic` auth (consumer key : consumer secret, base64-encoded)
2. Token is cached in Redis with TTL = `expires_in - 60` seconds
3. Build a password: `base64(shortcode + passkey + timestamp)`
4. POST the STK push request with `apiKey` in the header
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
KCB_BASE_URL=https://uat.buni.kcbgroup.com   # Sandbox; change to prod URL for live
KCB_CALLBACK_BASE_URL=https://xxxx.ngrok-free.app   # Public URL for callbacks
```

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
| Sandbox | `https://uat.buni.kcbgroup.com` |
| Production | Contact KCB Buni support for the production base URL |

## Dispatch

The M-Pesa initiate route (`/api/payments/mpesa/initiate`) checks `branch.mpesaGateway` and automatically dispatches to KCB Buni for branches configured with `KCB_BUNI`. The frontend only calls one route — gateway selection is transparent.
