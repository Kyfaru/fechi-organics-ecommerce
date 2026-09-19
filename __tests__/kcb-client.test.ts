/**
 * Unit tests for lib/payments/kcb/kcb-client.ts — the actual HTTP boundary
 * where StkSendError's sentNothing classification is decided. dispatch-stk
 * .test.ts mocks this whole module out, so the real fetch-response →
 * sentNothing mapping (and the amount/phone/shortcode transforms applied
 * before the request goes out) was previously untested.
 *
 * KCB_BASE_URL is read into a module-level constant at import time
 * (`const KCB_BASE = process.env.KCB_BASE_URL`), so it must be set BEFORE
 * the module is imported — hence the dynamic import in beforeAll instead of
 * a static top-level import.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
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

let initiateKcbStkPush: typeof import("@/lib/payments/kcb/kcb-client").initiateKcbStkPush;

beforeAll(async () => {
  process.env.KCB_BASE_URL = "https://api.buni.kcbgroup.com";
  ({ initiateKcbStkPush } = await import("@/lib/payments/kcb/kcb-client"));
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const testBranch = {
  id: "branch-1",
  shortcode: "600001",
  invoiceNumber: "12345",
  consumerKeyEnc: "enc-key",
  consumerSecretEnc: "enc-secret",
  apiKeyEnc: "enc-apikey",
};

function fakeResponse(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

const TOKEN_OK = fakeResponse(200, JSON.stringify({ access_token: "tok-123", expires_in: 3600 }));

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null); // no cached token by default
  mockRedisSet.mockResolvedValue("OK");
});

describe("initiateKcbStkPush — token step classification", () => {
  it("throws StkSendError(sentNothing=true) when the token request errors over the network", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" }),
    ).rejects.toMatchObject({ sentNothing: true });
    expect(mockFetch).toHaveBeenCalledTimes(1); // never reached the stkpush call
  });

  it("throws StkSendError(sentNothing=true) on a 500 from the token endpoint", async () => {
    mockFetch.mockResolvedValueOnce(fakeResponse(500, "upstream error"));

    const call = initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" });
    await expect(call).rejects.toBeInstanceOf(StkSendError);
    await expect(call).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=true) on a 401 from the token endpoint (bad credentials, still nothing sent)", async () => {
    mockFetch.mockResolvedValue(fakeResponse(401, "Invalid Credentials"));

    await expect(
      initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" }),
    ).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=true) when the token response isn't JSON", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, "<html>not the API</html>"));

    await expect(
      initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" }),
    ).rejects.toMatchObject({ sentNothing: true });
  });

  it("caches the token after a successful fetch and reuses it on the next call", async () => {
    mockFetch
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ CheckoutRequestID: "ws_CO_1", ResponseCode: "0" })));

    await initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" });
    expect(mockRedisSet).toHaveBeenCalledWith("kcb_token:branch-1", "tok-123", expect.objectContaining({ ex: expect.any(Number) }));

    // Second call: cached token present — only the stkpush fetch should fire.
    mockRedisGet.mockResolvedValue("tok-123");
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ CheckoutRequestID: "ws_CO_2", ResponseCode: "0" })));
    await initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("initiateKcbStkPush — stkpush step classification", () => {
  it("throws StkSendError(sentNothing=true) when the stkpush request errors over the network", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockRejectedValueOnce(new Error("socket hang up"));

    await expect(
      initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" }),
    ).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=false) on a 4xx from the stkpush endpoint — KCB answered with a rejection", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(fakeResponse(401, "Invalid Credentials"));

    await expect(
      initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" }),
    ).rejects.toMatchObject({ sentNothing: false });
  });

  it("throws StkSendError(sentNothing=true) on a 5xx from the stkpush endpoint", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(fakeResponse(502, "Bad Gateway"));

    await expect(
      initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" }),
    ).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=false) when the 2xx body isn't JSON — KCB processed the request", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(fakeResponse(200, "<html>ok</html>"));

    await expect(
      initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" }),
    ).rejects.toMatchObject({ sentNothing: false });
  });

  it("throws StkSendError(sentNothing=false) when a 2xx body is missing CheckoutRequestID", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ ResponseCode: "2001" })));

    await expect(
      initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" }),
    ).rejects.toMatchObject({ sentNothing: false });
  });

  it("resolves with CheckoutRequestID when KCB wraps the payload under a 'response' envelope", async () => {
    mockFetch
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ response: { CheckoutRequestID: "ws_CO_env", ResponseCode: "0" } })));

    const result = await initiateKcbStkPush({
      branch: testBranch,
      phone: "0712345678",
      amountKes: 100000,
      orderId: "o1",
      callbackUrl: "https://cb",
    });
    expect(result).toEqual({ CheckoutRequestID: "ws_CO_env", ResponseCode: "0" });
  });
});

describe("initiateKcbStkPush — request payload transforms", () => {
  function captureStkBody() {
    return JSON.parse((mockFetch.mock.calls[1][1] as { body: string }).body);
  }

  it("converts amountKes (actually cents) to whole KES by dividing by 100", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ CheckoutRequestID: "x", ResponseCode: "0" })));
    await initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 150000, orderId: "o1", callbackUrl: "https://cb" });
    expect(captureStkBody().amount).toBe(1500);
  });

  it("normalises a local-format phone number to 2547XXXXXXXX", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ CheckoutRequestID: "x", ResponseCode: "0" })));
    await initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" });
    expect(captureStkBody().phoneNumber).toBe("254712345678");
  });

  it("uses the branch's own shortcode as orgShortCode when present (sharedShortCode=false)", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ CheckoutRequestID: "x", ResponseCode: "0" })));
    await initiateKcbStkPush({ branch: testBranch, phone: "0712345678", amountKes: 100000, orderId: "o1", callbackUrl: "https://cb" });
    const body = captureStkBody();
    expect(body.orgShortCode).toBe("600001");
    expect(body.sharedShortCode).toBe(false);
  });

  it("falls back to the shared shortcode when the branch has none configured", async () => {
    mockFetch.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ CheckoutRequestID: "x", ResponseCode: "0" })));
    await initiateKcbStkPush({
      branch: { ...testBranch, shortcode: null },
      phone: "0712345678",
      amountKes: 100000,
      orderId: "o1",
      callbackUrl: "https://cb",
    });
    const body = captureStkBody();
    expect(body.orgShortCode).toBe("");
    expect(body.sharedShortCode).toBe(true);
  });
});
