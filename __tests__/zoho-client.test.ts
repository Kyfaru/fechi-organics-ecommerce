/**
 * Unit tests for lib/zoho.ts
 * Mocks: getRedis (lib/redis.ts), getZohoCredentials (lib/zoho-credentials.ts), global fetch
 * Environment: jsdom (vitest default from vitest.config.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock lib/redis.ts and lib/zoho-credentials.ts — must be hoisted before
// importing zoho. Credentials come from a Zoho organization's encrypted DB
// columns, not global env vars — several branches can share one org.
// ---------------------------------------------------------------------------
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
};

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
}));

const TEST_ORG_ID = "test-org-id";

vi.mock("@/lib/zoho-credentials", () => ({
  getZohoCredentials: vi.fn().mockResolvedValue({
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    refreshToken: "test-refresh-token",
    orgId: "test-org",
  }),
}));

// Import after mocks are set up
import { getAccessToken, zohoGet, ZohoApiError } from "@/lib/zoho";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFetchResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";
});

// ---------------------------------------------------------------------------
// getAccessToken
// ---------------------------------------------------------------------------
describe("getAccessToken", () => {
  it("returns cached token without calling fetch", async () => {
    mockRedis.get.mockResolvedValue("cached-token-abc");
    const fetchSpy = vi.spyOn(global, "fetch");

    const token = await getAccessToken(TEST_ORG_ID);

    expect(token).toBe("cached-token-abc");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches fresh token on cache miss and caches it for 3300s under a per-organization key", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ access_token: "fresh-token-xyz" })
    );

    const token = await getAccessToken(TEST_ORG_ID);

    expect(token).toBe("fresh-token-xyz");
    expect(mockRedis.set).toHaveBeenCalledWith(
      `zoho:access_token:${TEST_ORG_ID}`,
      "fresh-token-xyz",
      { ex: 3300 }
    );
  });

  it("throws ZohoApiError when fetch returns non-ok status", async () => {
    mockRedis.get.mockResolvedValue(null);

    vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ error: "invalid_client" }, 401)
    );

    await expect(getAccessToken(TEST_ORG_ID)).rejects.toBeInstanceOf(ZohoApiError);
  });

  it("throws ZohoApiError when response has error field", async () => {
    mockRedis.get.mockResolvedValue(null);

    vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ error: "invalid_grant" })
    );

    await expect(getAccessToken(TEST_ORG_ID)).rejects.toBeInstanceOf(ZohoApiError);
  });
});

// ---------------------------------------------------------------------------
// zohoGet
// ---------------------------------------------------------------------------
describe("zohoGet", () => {
  it("sends correct Authorization header with Zoho-oauthtoken format", async () => {
    mockRedis.get.mockResolvedValue("my-token");

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ items: [] })
    );

    await zohoGet(TEST_ORG_ID, "/items");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/inventory/v1/items");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Zoho-oauthtoken my-token"
    );
  });

  it("includes organization_id query param", async () => {
    mockRedis.get.mockResolvedValue("my-token");

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ items: [] })
    );

    await zohoGet(TEST_ORG_ID, "/items", { page: "1" });

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("organization_id=test-org");
    expect(url).toContain("page=1");
  });

  it("throws ZohoApiError on non-ok response", async () => {
    mockRedis.get.mockResolvedValue("my-token");

    vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ message: "Not Found" }, 404)
    );

    await expect(zohoGet(TEST_ORG_ID, "/items")).rejects.toBeInstanceOf(ZohoApiError);
  });
});
