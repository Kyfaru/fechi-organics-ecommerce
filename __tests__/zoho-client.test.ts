/**
 * Unit tests for lib/zoho.ts
 * Mocks: getRedis (lib/redis.ts), global fetch
 * Environment: jsdom (vitest default from vitest.config.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock lib/redis.ts — must be hoisted before importing zoho
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

  // Default env
  process.env.ZOHO_CLIENT_ID = "test-client-id";
  process.env.ZOHO_CLIENT_SECRET = "test-client-secret";
  process.env.ZOHO_REFRESH_TOKEN = "test-refresh-token";
  process.env.ZOHO_ORG_ID = "test-org";
  process.env.ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";
});

// ---------------------------------------------------------------------------
// getAccessToken
// ---------------------------------------------------------------------------
describe("getAccessToken", () => {
  it("returns cached token without calling fetch", async () => {
    mockRedis.get.mockResolvedValue("cached-token-abc");
    const fetchSpy = vi.spyOn(global, "fetch");

    const token = await getAccessToken();

    expect(token).toBe("cached-token-abc");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches fresh token on cache miss and caches it for 3300s", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ access_token: "fresh-token-xyz" })
    );

    const token = await getAccessToken();

    expect(token).toBe("fresh-token-xyz");
    expect(mockRedis.set).toHaveBeenCalledWith(
      "zoho:access_token",
      "fresh-token-xyz",
      { ex: 3300 }
    );
  });

  it("throws ZohoApiError when fetch returns non-ok status", async () => {
    mockRedis.get.mockResolvedValue(null);

    vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ error: "invalid_client" }, 401)
    );

    await expect(getAccessToken()).rejects.toBeInstanceOf(ZohoApiError);
  });

  it("throws ZohoApiError when response has error field", async () => {
    mockRedis.get.mockResolvedValue(null);

    vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ error: "invalid_grant" })
    );

    await expect(getAccessToken()).rejects.toBeInstanceOf(ZohoApiError);
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

    await zohoGet("/items");

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

    await zohoGet("/items", { page: "1" });

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("organization_id=test-org");
    expect(url).toContain("page=1");
  });

  it("throws ZohoApiError on non-ok response", async () => {
    mockRedis.get.mockResolvedValue("my-token");

    vi.spyOn(global, "fetch").mockImplementationOnce(() =>
      makeFetchResponse({ message: "Not Found" }, 404)
    );

    await expect(zohoGet("/items")).rejects.toBeInstanceOf(ZohoApiError);
  });
});
