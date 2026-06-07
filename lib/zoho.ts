/**
 * Zoho Inventory API client
 *
 * Handles OAuth token refresh (with Redis cache), and provides typed helpers
 * for GET/POST requests to the Zoho Inventory v1 API.
 */

import { getRedis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------
const ACCOUNTS_URL = () =>
  process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";
const ORG_ID = () => process.env.ZOHO_ORG_ID ?? "";
const BASE_URL = "https://www.zohoapis.com/inventory/v1";
const TOKEN_CACHE_KEY = "zoho:access_token";
const TOKEN_TTL = 3300; // 55 minutes (Zoho tokens expire after 60 min)

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class ZohoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ZohoApiError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ZohoItem = {
  item_id: string;
  name: string;
  status: string;
  description: string;
  rate: number;
  quantity_available: number;
  category_name: string;
};

export type ZohoSalesOrderPayload = {
  customer_name?: string;
  customer_email?: string;
  line_items: Array<{
    item_id?: string;
    name: string;
    quantity: number;
    rate: number;
  }>;
  discount?: number;
  shipping_charge?: number;
  notes?: string;
};

// Internal token response shape from Zoho accounts
type ZohoTokenResponse = {
  access_token?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------
export async function getAccessToken(): Promise<string> {
  const redis = getRedis();

  // 1. Check cache
  const cached = (await redis.get(TOKEN_CACHE_KEY)) as string | null;
  if (cached) return cached;

  // 2. Fetch fresh token
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new ZohoApiError(
      500,
      "[zoho] Missing ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, or ZOHO_REFRESH_TOKEN"
    );
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${ACCOUNTS_URL()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ZohoApiError(res.status, `[zoho] Token fetch failed: ${text}`);
  }

  const json = (await res.json()) as ZohoTokenResponse;

  if (json.error || !json.access_token) {
    throw new ZohoApiError(
      401,
      `[zoho] Token error: ${json.error ?? "no access_token in response"}`,
      json
    );
  }

  // 3. Cache token
  await redis.set(TOKEN_CACHE_KEY, json.access_token, { ex: TOKEN_TTL });

  return json.access_token;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
export async function zohoGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getAccessToken();
  const orgId = ORG_ID();

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("organization_id", orgId);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ZohoApiError(
      res.status,
      `[zoho] GET ${path} failed (${res.status}): ${text}`
    );
  }

  return res.json() as Promise<T>;
}

export async function zohoPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const orgId = ORG_ID();

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("organization_id", orgId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ZohoApiError(
      res.status,
      `[zoho] POST ${path} failed (${res.status}): ${text}`
    );
  }

  return res.json() as Promise<T>;
}
