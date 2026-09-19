/**
 * Unit tests for lib/payments/mpesa/stk-push.ts's initiateSTKPush — the
 * Daraja STK-push HTTP boundary. dispatch-stk.test.ts mocks this module out
 * entirely, so the real fetch-response → sentNothing mapping, the
 * amount/AccountReference/TransactionType transforms, and the pre-flight
 * credential/phone guards were previously untested.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { branch } from "@prisma/client";
import { StkSendError } from "@/lib/payments/stk-errors";

vi.mock("@/lib/crypto", () => ({
  decrypt: (v: string) => `decrypted:${v}`,
  fingerprint: () => "fp",
}));

const mockGetDarajaToken = vi.fn().mockResolvedValue("token");
vi.mock("@/lib/payments/mpesa/daraja-client", () => ({
  getDarajaToken: (...a: unknown[]) => mockGetDarajaToken(...a),
}));

import { initiateSTKPush, normalisePhone } from "@/lib/payments/mpesa/stk-push";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const testBranch = {
  id: "branch-1",
  passkeyEnc: "enc-passkey",
  shortcode: "600001",
  mpesaType: "PAYBILL",
} as unknown as branch;

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => {
      if (typeof body === "string") throw new SyntaxError("Unexpected token");
      return body;
    },
  };
}

const baseParams = {
  branch: testBranch,
  phone: "0712345678",
  amountKes: 1500,
  orderId: "order-1234567890",
  callbackUrl: "https://fechiorganics.shop/api/payments/mpesa/callback",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDarajaToken.mockResolvedValue("token");
  delete (process.env as Record<string, string | undefined>).DARAJA_ENV;
});

describe("initiateSTKPush — pre-flight guards (plain Error, not StkSendError — dispatch-stk.ts pre-empts these)", () => {
  it("throws a plain Error when the branch has no passkey configured", async () => {
    const promise = initiateSTKPush({ ...baseParams, branch: { ...testBranch, passkeyEnc: null } });
    await expect(promise).rejects.toThrow(/no passkey configured/);
    await expect(promise).rejects.not.toBeInstanceOf(StkSendError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws a plain Error when the branch has no shortcode configured", async () => {
    const promise = initiateSTKPush({ ...baseParams, branch: { ...testBranch, shortcode: null } });
    await expect(promise).rejects.toThrow(/no shortcode configured/);
    await expect(promise).rejects.not.toBeInstanceOf(StkSendError);
  });

  it("throws a plain Error (not StkSendError) on an unparseable phone number, even though a token was already fetched", async () => {
    const promise = initiateSTKPush({ ...baseParams, phone: "not-a-phone" });
    await expect(promise).rejects.not.toBeInstanceOf(StkSendError);
    expect(mockGetDarajaToken).toHaveBeenCalled(); // token step already ran
    expect(mockFetch).not.toHaveBeenCalled(); // but the actual push never fired
  });
});

describe("initiateSTKPush — sentNothing classification at the push endpoint", () => {
  it("throws StkSendError(sentNothing=true) on a network error", async () => {
    mockFetch.mockRejectedValue(new Error("socket hang up"));
    await expect(initiateSTKPush(baseParams)).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=false) on a 4xx — Daraja answered with a rejection", async () => {
    mockFetch.mockResolvedValue(fakeResponse(400, "Bad Request"));
    await expect(initiateSTKPush(baseParams)).rejects.toMatchObject({ sentNothing: false });
  });

  it("throws StkSendError(sentNothing=true) on a 5xx", async () => {
    mockFetch.mockResolvedValue(fakeResponse(503, "Service Unavailable"));
    await expect(initiateSTKPush(baseParams)).rejects.toMatchObject({ sentNothing: true });
  });

  it("throws StkSendError(sentNothing=false) when the 2xx body isn't JSON", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, "<html>ok</html>"));
    await expect(initiateSTKPush(baseParams)).rejects.toMatchObject({ sentNothing: false });
  });

  it("throws StkSendError(sentNothing=false) when Daraja returns ResponseCode != 0", async () => {
    mockFetch.mockResolvedValue(
      fakeResponse(200, { MerchantRequestID: "m1", CheckoutRequestID: "ws_CO_1", ResponseCode: "1", ResponseDescription: "Rejected" }),
    );
    await expect(initiateSTKPush(baseParams)).rejects.toMatchObject({ sentNothing: false });
  });

  it("resolves with the full response on ResponseCode 0", async () => {
    const okResponse = {
      MerchantRequestID: "m1",
      CheckoutRequestID: "ws_CO_1",
      ResponseCode: "0",
      ResponseDescription: "Success",
      CustomerMessage: "Success",
    };
    mockFetch.mockResolvedValue(fakeResponse(200, okResponse));
    await expect(initiateSTKPush(baseParams)).resolves.toEqual(okResponse);
  });
});

describe("initiateSTKPush — request payload transforms", () => {
  function captureBody() {
    return JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
  }
  const OK = { MerchantRequestID: "m1", CheckoutRequestID: "ws_CO_1", ResponseCode: "0", ResponseDescription: "ok", CustomerMessage: "ok" };

  it("rounds amountKes to the nearest whole KES (no further division — Daraja receives whole KES directly)", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, OK));
    await initiateSTKPush({ ...baseParams, amountKes: 999.6 });
    expect(captureBody().Amount).toBe(1000);
  });

  it("slices the AccountReference to fit Daraja's 12-char limit", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, OK));
    await initiateSTKPush({ ...baseParams, orderId: "MPESA20260917T1234X" });
    expect(captureBody().AccountReference).toBe("MPESA20260917T1234X".slice(4, -1));
  });

  it("uses CustomerPayBillOnline in sandbox regardless of branch mpesaType", async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, OK));
    await initiateSTKPush({ ...baseParams, branch: { ...testBranch, mpesaType: "TILL" } as unknown as branch });
    expect(captureBody().TransactionType).toBe("CustomerPayBillOnline");
  });

  it("uses CustomerBuyGoodsOnline in production for a non-PAYBILL branch", async () => {
    process.env.DARAJA_ENV = "production";
    mockFetch.mockResolvedValue(fakeResponse(200, OK));
    await initiateSTKPush({ ...baseParams, branch: { ...testBranch, mpesaType: "TILL" } as unknown as branch });
    expect(captureBody().TransactionType).toBe("CustomerBuyGoodsOnline");
  });

  it("uses CustomerPayBillOnline in production for a PAYBILL branch", async () => {
    process.env.DARAJA_ENV = "production";
    mockFetch.mockResolvedValue(fakeResponse(200, OK));
    await initiateSTKPush(baseParams);
    expect(captureBody().TransactionType).toBe("CustomerPayBillOnline");
  });
});

describe("normalisePhone", () => {
  it.each([
    ["0712345678", "254712345678"],
    ["+254712345678", "254712345678"],
    ["254712345678", "254712345678"],
    ["712345678", "254712345678"],
  ])("normalises %s to %s", (raw, expected) => {
    expect(normalisePhone(raw)).toBe(expected);
  });

  it("throws on an unparseable number", () => {
    expect(() => normalisePhone("123")).toThrow(/Invalid Kenyan phone number/);
  });
});
