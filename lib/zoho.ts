/**
 * Zoho Inventory API client
 *
 * Handles OAuth token refresh (with Redis cache), and provides typed helpers
 * for GET/POST requests to the Zoho Inventory v1 API. Every call is scoped to
 * a single Zoho organization — several branches can share one org (see
 * lib/zoho-credentials.ts and prisma schema `zohoOrganization`).
 */

import { getRedis } from "@/lib/redis";
import { getZohoCredentials } from "@/lib/zoho-credentials";

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------
// Zoho's OAuth accounts host is shared across all tenants/orgs — it isn't
// per-org like the client id/secret/refresh token are — so it stays a
// global env var rather than moving into lib/zoho-credentials.ts.
const ACCOUNTS_URL = () =>
  process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";
const BASE_URL = "https://www.zohoapis.com/inventory/v1";
const TOKEN_CACHE_KEY = (organizationId: string) => `zoho:access_token:${organizationId}`;
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
  sku?: string;
  item_type?: string;
  product_type?: string;
  unit?: string;
  brand?: string;
  purchase_rate?: number;
  // Per-warehouse stock breakdown — only present when Zoho's multi-location
  // inventory is enabled for the org. Field names are Zoho's documented
  // shape; verify against a live payload before relying on them (see
  // lib/zoho-sync.ts's stock-distribution logic).
  warehouses?: Array<{
    warehouse_id: string;
    warehouse_name?: string;
    warehouse_available_stock?: number;
  }>;
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
/**
 * Fetches (or reuses a cached) Zoho OAuth access token for an organization.
 * @param organizationId - the zohoOrganization whose credentials to use
 * @param preloadedCreds - optional, avoids a second decrypt+DB round trip when
 *   the caller (zohoGet/zohoPost) already loaded credentials for `organization_id`
 * @returns a bearer access token valid for Zoho Inventory API calls
 * @throws ZohoApiError if the org's refresh-token exchange fails
 */
export async function getAccessToken(
  organizationId: string,
  preloadedCreds?: Awaited<ReturnType<typeof getZohoCredentials>>
): Promise<string> {
  const redis = getRedis();
  const cacheKey = TOKEN_CACHE_KEY(organizationId);

  // 1. Check cache
  const cached = (await redis.get(cacheKey)) as string | null;
  if (cached) return cached;

  // 2. Fetch fresh token using this org's own Zoho credentials
  const { clientId, clientSecret, refreshToken } = preloadedCreds ?? (await getZohoCredentials(organizationId));

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
  await redis.set(cacheKey, json.access_token, { ex: TOKEN_TTL });

  return json.access_token;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
export async function zohoGet<T>(
  organizationId: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const creds = await getZohoCredentials(organizationId);
  const token = await getAccessToken(organizationId, creds);
  const { orgId } = creds;

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

export async function zohoPost<T>(
  organizationId: string,
  path: string,
  body: unknown
): Promise<T> {
  const creds = await getZohoCredentials(organizationId);
  const token = await getAccessToken(organizationId, creds);
  const { orgId } = creds;

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
