import { decrypt } from "@/lib/crypto";
import { getRedis } from "@/lib/redis";

export interface KcbStkPushOpts {
  branch: {
    id: string;
    shortcode: string;         // orgShortCode / paybill number
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
  if (typeof cached === "string" && cached.length > 0) return cached;

  const consumerKey = decrypt(branch.consumerKeyEnc);
  const consumerSecret = decrypt(branch.consumerSecretEnc);
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  // KCB Buni: grant_type as query param, Basic auth header
  const res = await fetch(`${KCB_BASE}/token?grant_type=client_credentials`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KCB token fetch failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const ttl = Math.max(60, (data.expires_in ?? 3600) - 60);
  await redis.set(cacheKey, data.access_token, { ex: ttl });

  return data.access_token;
}

export async function initiateKcbStkPush(
  opts: KcbStkPushOpts,
): Promise<{ CheckoutRequestID: string; ResponseCode: string }> {
  const token = await getKcbToken(opts.branch);
  const apiKey = opts.branch.apiKeyEnc ? decrypt(opts.branch.apiKeyEnc) : "";

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
      invoiceNumber: opts.branch.invoiceNumber ?? opts.branch.shortcode, // KCB invoice/account number
      sharedShortCode: true,
      orgShortCode: "522522",       // paybill number e.g. "522522"
      orgPassKey: "",                            // empty for KCB Buni
      callbackUrl: opts.callbackUrl,
      transactionDescription: `Fechi Organics Order ${opts.orderId.slice(0, 8).toUpperCase()}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KCB STK push failed: ${res.status} ${body}`);
  }

  const data = await res.json() as Record<string, unknown>;

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
