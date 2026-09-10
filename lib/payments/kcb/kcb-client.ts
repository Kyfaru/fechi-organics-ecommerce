import { decrypt, fingerprint } from "@/lib/crypto";
import { getRedis } from "@/lib/redis";

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

const KCB_BASE = process.env.KCB_BASE_URL ?? "https://uat.buni.kcbgroup.com";

async function getKcbToken(branch: KcbStkPushOpts["branch"]): Promise<string> {
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
    `[kcb-client] token request — branch=${branch.id} base=${KCB_BASE} consumerKey=${fingerprint(consumerKey)} consumerSecret=${fingerprint(consumerSecret)}`,
  );

  // KCB Buni: grant_type as query param, Basic auth header
  const res = await fetch(`${KCB_BASE}/token?grant_type=client_credentials`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const rawBody = await res.text();
  if (!res.ok) {
    console.error(`[kcb-client] token fetch failed — branch=${branch.id} status=${res.status} body="${rawBody}"`);
    throw new Error(`KCB token fetch failed: ${res.status} ${rawBody}`);
  }

  let data: { access_token: string; expires_in: number };
  try {
    data = JSON.parse(rawBody);
  } catch {
    // A non-JSON 2xx body means KCB_BASE_URL is pointing at something that
    // isn't the API gateway (e.g. a marketing page) — surface the raw body
    // instead of letting JSON.parse's cryptic "Unexpected token '<'" hide it.
    console.error(`[kcb-client] token response wasn't JSON — branch=${branch.id} base=${KCB_BASE} body="${rawBody.slice(0, 300)}"`);
    throw new Error(`KCB token response wasn't JSON (check KCB_BASE_URL=${KCB_BASE}): ${rawBody.slice(0, 200)}`);
  }
  const ttl = Math.max(60, (data.expires_in ?? 3600) - 60);
  await redis.set(cacheKey, data.access_token, { ex: ttl });

  return data.access_token;
}

export async function initiateKcbStkPush(
  opts: KcbStkPushOpts,
): Promise<{ CheckoutRequestID: string; ResponseCode: string }> {
  const token = await getKcbToken(opts.branch);
  const apiKey = opts.branch.apiKeyEnc ? decrypt(opts.branch.apiKeyEnc) : "";

  console.info(
    `[kcb-client] stkpush request — branch=${opts.branch.id} base=${KCB_BASE} invoiceNumber=${opts.branch.invoiceNumber} apiKey=${fingerprint(apiKey)}`,
  );

  // KCB Buni expects 2547XXXXXXXX international format (no + prefix)
  const phone = opts.phone.replace(/\D/g, "").replace(/^0/, "254").replace(/^\+/, "");

  const res = await fetch(`${KCB_BASE}/mm/api/request/1.0.0/stkpush`, {
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
      sharedShortCode: true,
      orgShortCode: "",       // paybill number should always be empty
      orgPassKey: "",                            // empty for KCB Buni
      callbackUrl: opts.callbackUrl,
      transactionDescription: `Fechi Organics Order ${opts.orderId.slice(0, 8).toUpperCase()}`,
    }),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    console.error(`[kcb-client] stkpush failed — branch=${opts.branch.id} status=${res.status} apiKey=${fingerprint(apiKey)} body="${rawBody}"`);
    throw new Error(`KCB STK push failed: ${res.status} ${rawBody}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.error(`[kcb-client] stkpush response wasn't JSON — branch=${opts.branch.id} base=${KCB_BASE} body="${rawBody.slice(0, 300)}"`);
    throw new Error(`KCB STK push response wasn't JSON (check KCB_BASE_URL=${KCB_BASE}): ${rawBody.slice(0, 200)}`);
  }

  // KCB Buni wraps the payload under a "response" envelope
  const inner = (data.response ?? data) as Record<string, unknown>;
  const checkoutRequestId = (inner.CheckoutRequestID as string | undefined) ?? "";

  if (!checkoutRequestId) {
    console.error("[kcb-client] No CheckoutRequestID in response:", data);
  }

  return {
    CheckoutRequestID: checkoutRequestId,
    ResponseCode: (inner.ResponseCode as string | undefined) ?? "0",
  };
}
