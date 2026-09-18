import { decrypt, fingerprint } from "@/lib/crypto";
import { getRedis } from "@/lib/redis";
import { StkSendError } from "@/lib/payments/stk-errors";

export interface KcbStkPushOpts {
  branch: {
    id: string;
    shortcode: string | null;         // orgShortCode / paybill number
    invoiceNumber: string | null; // KCB Buni invoice/account number (distinct from shortcode)
    consumerKeyEnc: string;
    consumerSecretEnc: string;
    apiKeyEnc: string | null;  // KCB Buni API key (encrypted)
  };
  phone: string;          // raw phone, normalised internally
  amountKes: number;      // in KES cents — divided by 100 before sending
  orderId: string;
  callbackUrl: string;
}

// No UAT/sandbox fallback: a missing KCB_BASE_URL must fail loudly, not
// silently route live credentials at the UAT gateway (which accepts any
// request, returns ResponseCode 0, and never rings a real handset — the
// prompt-never-arrives-then-1037 signature this file used to produce).
const KCB_BASE = process.env.KCB_BASE_URL;

function requireKcbBase(): string {
  if (!KCB_BASE) {
    throw new Error(
      "[kcb-client] KCB_BASE_URL is not set. Refusing to fall back to a sandbox host — set it to the production Buni URL.",
    );
  }
  return KCB_BASE;
}

async function getKcbToken(branch: KcbStkPushOpts["branch"]): Promise<string> {
  const kcbBase = requireKcbBase();
  const redis = getRedis();
  const cacheKey = `kcb_token:${branch.id}`;

  const cached = await redis.get(cacheKey);
  if (typeof cached === "string" && cached.length > 0) {
    // A token cached before consumerKey/consumerSecret were last changed in
    // the DB (e.g. a re-run of prisma/set-daraja-creds.ts) would still be
    // served here and paired with today's apiKey — that mismatch reads as a
    // 401 "Invalid Credentials" downstream with no obvious cause, so log the
    // cache hit itself rather than silently skipping straight to the request.
    console.info(`[kcb-client] using cached token — branch=${branch.id} token=${fingerprint(cached)}`);
    return cached;
  }

  const consumerKey = decrypt(branch.consumerKeyEnc);
  const consumerSecret = decrypt(branch.consumerSecretEnc);
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  console.info(
    `[kcb-client] token request — branch=${branch.id} base=${kcbBase} consumerKey=${fingerprint(consumerKey)} consumerSecret=${fingerprint(consumerSecret)}`,
  );

  // KCB Buni: grant_type as query param, Basic auth header. A token-step
  // failure of any kind means the STK push was never attempted — always
  // safe to try the other gateway.
  let res: Response;
  try {
    res = await fetch(`${kcbBase}/token?grant_type=client_credentials`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // Matches Daraja's token-fetch timeout (lib/payments/mpesa/daraja-client.ts)
      // — a hung KCB Buni token endpoint must fail fast, not stall the request.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (fetchErr) {
    console.error(`[kcb-client] token request errored — branch=${branch.id}`, fetchErr);
    throw new StkSendError(`KCB token request failed: ${(fetchErr as Error).message}`, true);
  }

  const rawBody = await res.text();
  if (!res.ok) {
    console.error(`[kcb-client] token fetch failed — branch=${branch.id} status=${res.status} body="${rawBody}"`);
    throw new StkSendError(`KCB token fetch failed: ${res.status} ${rawBody}`, true);
  }

  let data: { access_token: string; expires_in: number };
  try {
    data = JSON.parse(rawBody);
  } catch {
    // A non-JSON 2xx body means KCB_BASE_URL is pointing at something that
    // isn't the API gateway (e.g. a marketing page) — surface the raw body
    // instead of letting JSON.parse's cryptic "Unexpected token '<'" hide it.
    console.error(`[kcb-client] token response wasn't JSON — branch=${branch.id} base=${kcbBase} body="${rawBody.slice(0, 300)}"`);
    throw new StkSendError(`KCB token response wasn't JSON (check KCB_BASE_URL=${kcbBase}): ${rawBody.slice(0, 200)}`, true);
  }
  const ttl = Math.max(60, (data.expires_in ?? 3600) - 60);
  await redis.set(cacheKey, data.access_token, { ex: ttl });

  return data.access_token;
}

export async function initiateKcbStkPush(
  opts: KcbStkPushOpts,
): Promise<{ CheckoutRequestID: string; ResponseCode: string }> {
  const token = await getKcbToken(opts.branch);
  const kcbBase = requireKcbBase();
  const apiKey = opts.branch.apiKeyEnc ? decrypt(opts.branch.apiKeyEnc) : "";

  console.info(
    `[kcb-client] stkpush request — branch=${opts.branch.id} base=${kcbBase} invoiceNumber=${opts.branch.invoiceNumber} apiKey=${fingerprint(apiKey)}`,
  );

  // KCB Buni expects 2547XXXXXXXX international format (no + prefix)
  const phone = opts.phone.replace(/\D/g, "").replace(/^0/, "254").replace(/^\+/, "");

  // sharedShortCode/orgShortCode used to be hardcoded to true/"" for every
  // branch, which always routes through KCB's shared 522522 shortcode
  // regardless of whether the branch has its own paybill — a mismatch between
  // that shared code and the branch's real account is exactly the
  // accepted-then-1037 signature. Derive both from branch.shortcode instead:
  // a branch with no shortcode of its own uses the shared code (today's
  // behaviour, unchanged for branches seeded that way); a branch with a real
  // paybill number uses it directly.
  const orgShortCode = opts.branch.shortcode ?? "";
  const sharedShortCode = orgShortCode.length === 0;

  let res: Response;
  try {
    res = await fetch(`${kcbBase}/mm/api/request/1.0.0/stkpush`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apiKey: apiKey,
        "Content-Type": "application/json",
      },
      // Field names per KCB Buni Node.js integration guide
      body: JSON.stringify({
        phoneNumber: phone,
        amount: Math.round(opts.amountKes / 100), // whole KES
        invoiceNumber: opts.branch.invoiceNumber ?? opts.branch.shortcode ?? null, // KCB invoice/account number
        sharedShortCode,
        orgShortCode,
        orgPassKey: "",                            // KCB Buni doesn't use a Daraja-style passkey — always empty, not a config gap
        callbackUrl: opts.callbackUrl,
        transactionDescription: `Fechi Organics Order ${opts.orderId.slice(0, 8).toUpperCase()}`,
      }),
      // Matches Daraja's STK-push timeout (lib/payments/mpesa/stk-push.ts) — a
      // hung KCB Buni STK endpoint must fail fast so the dual-gateway fallback
      // (or a clear error) kicks in instead of the request stalling indefinitely.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (fetchErr) {
    // The request never got a response at all (DNS/connect error, or the
    // AbortSignal fired first) — KCB never received it, safe to fail over.
    console.error(`[kcb-client] stkpush request errored — branch=${opts.branch.id}`, fetchErr);
    throw new StkSendError(`KCB STK push request failed: ${(fetchErr as Error).message}`, true);
  }

  const rawBody = await res.text();
  if (!res.ok) {
    console.error(`[kcb-client] stkpush failed — branch=${opts.branch.id} status=${res.status} apiKey=${fingerprint(apiKey)} body="${rawBody}"`);
    // Only a 5xx means the gateway itself is down/erroring — a 4xx means KCB
    // received and rejected the request (bad auth, bad shortcode, etc.);
    // that's an answer, not a non-event, so it must not trigger failover.
    throw new StkSendError(`KCB STK push failed: ${res.status} ${rawBody}`, res.status >= 500);
  }

  // From here on we have a 2xx — KCB processed the request, so nothing below
  // is eligible for failover even if the body is unexpected.
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.error(`[kcb-client] stkpush response wasn't JSON — branch=${opts.branch.id} base=${kcbBase} body="${rawBody.slice(0, 300)}"`);
    throw new StkSendError(`KCB STK push response wasn't JSON (check KCB_BASE_URL=${kcbBase}): ${rawBody.slice(0, 200)}`, false);
  }

  // KCB Buni wraps the payload under a "response" envelope
  const inner = (data.response ?? data) as Record<string, unknown>;
  const checkoutRequestId = (inner.CheckoutRequestID as string | undefined) ?? "";
  const responseCode = (inner.ResponseCode as string | undefined) ?? "0";

  if (!checkoutRequestId) {
    console.error("[kcb-client] No CheckoutRequestID in response:", data);
    throw new StkSendError(
      `KCB STK push returned no CheckoutRequestID (ResponseCode=${responseCode})`,
      false,
    );
  }

  return { CheckoutRequestID: checkoutRequestId, ResponseCode: responseCode };
}
