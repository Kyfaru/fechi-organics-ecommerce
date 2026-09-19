/**
 * Unit tests for lib/payments/mpesa/daraja-client.ts's getDarajaToken — the
 * Daraja token-fetch classification. dispatch-stk.test.ts mocks this module
 * out entirely, so the real fetch-response → sentNothing mapping was
 * previously untested. Unlike kcb-client.ts's stkpush step, EVERY non-ok
 * token response here is sentNothing=true unconditionally (the token step
 * never sends a prompt regardless of status code), which this file locks in.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { StkSendError } from "@/lib/payments/stk-errors";

vi.mock("@/lib/crypto", () => ({
  decrypt: (v: string) => `decrypted:${v}`,
  fingerprint: () => "fp",
}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn().mockResolvedValue("OK");
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: (...a: unknown[]) => mockRedisGet(...a),
    set: (...a: unknown[]) => mockRedisSet(...a),
  }),
}));

import { getDarajaToken } from "@/lib/payments/mpesa/daraja-client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const testBranch = { id: "branch-1", consumerKeyEnc: "enc-key", consumerSecretEnc: "enc-secret" };

function fakeResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
});

describe("getDarajaToken — cache", () => {
  it("returns the cached token without making a network call", async () => {
    mockRedisGet.mockResolvedValue("cached-token");
    const token = await getDarajaToken(testBranch);
    expect(token).toBe("cached-token");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("caches a freshly fetched token for (expires_in - 60) seconds", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, JSON.stringify({ access_token: "fresh-token", expires_in: "3599" })));
    const token = await getDarajaToken(testBranch);
    expect(token).toBe("fresh-token");
    expect(mockRedisSet).toHaveBeenCalledWith("mpesa_token:branch-1", "fresh-token", { ex: 3539 });
  });

  it("floors the cache TTL at 30 seconds even for a short expires_in", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, JSON.stringify({ access_token: "fresh-token", expires_in: "45" })));
    await getDarajaToken(testBranch);
    expect(mockRedisSet).toHaveBeenCalledWith("mpesa_token:branch-1", "fresh-token", { ex: 30 });
  });
});

describe("getDarajaToken — sentNothing classification", () => {
  it("throws StkSendError(sentNothing=true) on a network error", async () => {
    mockFetch.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(getDarajaToken(testBranch)).rejects.toMatchObject({ sentNothing: true });
    await expect(getDarajaToken(testBranch)).rejects.toBeInstanceOf(StkSendError);
  });

  it("throws StkSendError(sentNothing=true) on a 4xx (still true — the token step never sends a prompt)", async () => {
    mockFetch.mockResolvedValue(fakeResponse(400, "Bad Request"));
    await expect(getDarajaToken(testBranch)).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=true) on a 5xx", async () => {
    mockFetch.mockResolvedValue(fakeResponse(503, "Service Unavailable"));
    await expect(getDarajaToken(testBranch)).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=true) when the response isn't JSON", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, "not json"));
    await expect(getDarajaToken(testBranch)).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=true) when access_token is missing from a 2xx body", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, JSON.stringify({ expires_in: "3600" })));
    await expect(getDarajaToken(testBranch)).rejects.toMatchObject({ sentNothing: true });
  });
});
