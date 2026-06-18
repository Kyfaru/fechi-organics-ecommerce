/**
 * Daraja (Safaricom M-Pesa) OAuth token client.
 *
 * Each branch has its own Consumer Key / Secret encrypted at rest.
 * Tokens are cached in Redis (or the in-process stub) to avoid hammering
 * Daraja on every STK push — Safaricom rate-limits token generation.
 *
 * Cache TTL = (expires_in from Daraja) − 60 seconds, giving a comfortable
 * buffer so we never use an about-to-expire token.
 */

import { decrypt } from "@/lib/crypto";
import { getRedis } from "@/lib/redis";

const DARAJA_BASE =
  process.env.DARAJA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

interface DarajaTokenResponse {
  access_token: string;
  expires_in: string; // Daraja returns this as a string, e.g. "3599"
}

/**
 * Returns a valid Daraja access token for the given branch.
 *
 * Checks Redis first. If no cached token exists (or it has expired),
 * fetches a fresh one and caches it.
 *
 * @param branch - Branch record containing encrypted consumer key and secret
 * @returns A valid Daraja access token string
 * @throws Error if the token fetch fails or credentials are invalid
 */
export async function getDarajaToken(branch: {
  id: string;
  consumerKeyEnc: string;
  consumerSecretEnc: string;
}): Promise<string> {
  const redis = getRedis();
  const cacheKey = `mpesa_token:${branch.id}`;

  // Try cache first to avoid unnecessary Daraja calls
  const cached = await redis.get(cacheKey);
  if (typeof cached === "string" && cached.length > 0) {
    return cached;
  }

  // Decrypt credentials — throws if the encrypted payload is malformed
  const key = decrypt(branch.consumerKeyEnc);
  const secret = decrypt(branch.consumerSecretEnc);
  const basicAuth = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch(
    `${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${basicAuth}` },
      // Safaricom can be slow — 10-second timeout is safe for server-side use
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `[daraja] Token fetch failed: ${res.status} ${res.statusText} — ${body}`,
    );
  }

  const data = (await res.json()) as DarajaTokenResponse;

  if (!data.access_token) {
    throw new Error("[daraja] Token response missing access_token field");
  }

  // Cache for (expires_in − 60) seconds so we never serve a stale token.
  // Daraja returns expires_in as a string number ("3599").
  const ttlSeconds = Math.max(30, parseInt(data.expires_in, 10) - 60);
  await redis.set(cacheKey, data.access_token, { ex: ttlSeconds });

  return data.access_token;
}
