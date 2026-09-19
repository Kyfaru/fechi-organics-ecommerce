/**
 * Unit tests for lib/payments/dispatch-stk.ts — the failover rule that
 * replaced "retry the other gateway on ANY thrown error" (which could
 * double-send a real STK prompt) with "retry only when the primary
 * gateway provably sent nothing."
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { branch } from "@prisma/client";
import { StkSendError } from "@/lib/payments/stk-errors";

const mockResolveMpesaGateway = vi.fn();
const mockOtherGateway = vi.fn();
const mockResolvePaymentBranch = vi.fn();
vi.mock("@/lib/payments/mpesa/gateway", () => ({
  resolveMpesaGateway: (...a: unknown[]) => mockResolveMpesaGateway(...a),
  otherGateway: (...a: unknown[]) => mockOtherGateway(...a),
  resolvePaymentBranch: (...a: unknown[]) => mockResolvePaymentBranch(...a),
}));

const mockResolveKcbBranch = vi.fn();
vi.mock("@/lib/payments/kcb/resolve-kcb-branch", () => ({
  resolveKcbBranch: (...a: unknown[]) => mockResolveKcbBranch(...a),
  originBranchTag: () => "NBO",
}));

const mockInitiateKcbStkPush = vi.fn();
vi.mock("@/lib/payments/kcb/kcb-client", () => ({
  initiateKcbStkPush: (...a: unknown[]) => mockInitiateKcbStkPush(...a),
}));

const mockGetDarajaToken = vi.fn().mockResolvedValue("token");
vi.mock("@/lib/payments/mpesa/daraja-client", () => ({
  getDarajaToken: (...a: unknown[]) => mockGetDarajaToken(...a),
}));

const mockInitiateSTKPush = vi.fn();
vi.mock("@/lib/payments/mpesa/stk-push", () => ({
  initiateSTKPush: (...a: unknown[]) => mockInitiateSTKPush(...a),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: (v: string) => `decrypted:${v}`,
}));

vi.mock("@/lib/payments/gateway-env", () => ({
  assertBranchNotSandbox: vi.fn(),
}));

import { dispatchStk } from "@/lib/payments/dispatch-stk";

const testBranch = {
  id: "branch-1",
  name: "Nairobi",
  county: "Nairobi",
  shortcode: "600001",
  invoiceNumber: "12345",
  consumerKeyEnc: "enc-key",
  consumerSecretEnc: "enc-secret",
  passkeyEnc: "enc-passkey",
  apiKeyEnc: "enc-apikey",
  mpesaType: "PAYBILL",
} as unknown as branch;

const baseInput = {
  branch: testBranch,
  phone: "254712345678",
  amountCents: 150000,
  orderId: "order-1",
  orderNumber: "MPESA20260917T1234",
  kind: "online" as const,
  kcbCallbackUrl: "https://fechiorganics.shop/api/payments/kcb/callback",
  darajaCallbackUrl: "https://fechiorganics.shop/api/payments/mpesa/callback",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveMpesaGateway.mockReturnValue("KCB_BUNI");
  mockOtherGateway.mockImplementation((g: string) => (g === "KCB_BUNI" ? "DARAJA" : "KCB_BUNI"));
  mockResolvePaymentBranch.mockImplementation(async (b: unknown) => b);
  mockResolveKcbBranch.mockImplementation(async (b: unknown) => b);
});

describe("dispatchStk — primary succeeds", () => {
  it("returns success and never attempts the fallback gateway", async () => {
    mockInitiateKcbStkPush.mockResolvedValue({ CheckoutRequestID: "ws_CO_1", ResponseCode: "0" });

    const result = await dispatchStk(baseInput);

    expect(result).toEqual({ success: true, checkoutRequestId: "ws_CO_1", gatewayUsed: "KCB_BUNI" });
    expect(mockInitiateSTKPush).not.toHaveBeenCalled();
  });
});

describe("dispatchStk — amount unit conversion (KCB divides by 100 internally, Daraja does not)", () => {
  // Money-critical: dispatch-stk.ts's own StkDispatchInput.amountCents is
  // always cents. kcb-client.ts's `amountKes` field is misleadingly named —
  // it actually expects cents and divides by 100 itself — so dispatchKcb
  // must forward amountCents UNCHANGED. stk-push.ts's `amountKes` expects
  // already-whole KES with no further division — so dispatchDaraja must
  // divide by 100 before calling it. Passing the wrong one either overcharges
  // the customer 100x or undercharges them to 1/100th.
  it("forwards amountCents to KCB unchanged", async () => {
    mockInitiateKcbStkPush.mockResolvedValue({ CheckoutRequestID: "ws_CO_1", ResponseCode: "0" });

    await dispatchStk({ ...baseInput, amountCents: 250000 });

    expect(mockInitiateKcbStkPush).toHaveBeenCalledWith(
      expect.objectContaining({ amountKes: 250000 }),
    );
  });

  it("divides amountCents by 100 before calling Daraja", async () => {
    mockResolveMpesaGateway.mockReturnValue("DARAJA");
    mockInitiateSTKPush.mockResolvedValue({ CheckoutRequestID: "ws_CO_1", ResponseCode: "0" });

    await dispatchStk({ ...baseInput, amountCents: 250000 });

    expect(mockInitiateSTKPush).toHaveBeenCalledWith(
      expect.objectContaining({ amountKes: 2500 }),
    );
  });

  it("divides amountCents by 100 for the Daraja fallback leg too", async () => {
    // primary is KCB (default), fails over to Daraja — the fallback leg must
    // apply the same conversion as a direct-primary Daraja dispatch.
    mockInitiateKcbStkPush.mockRejectedValue(new StkSendError("KCB token fetch failed: 500", true));
    mockInitiateSTKPush.mockResolvedValue({ CheckoutRequestID: "ws_CO_fallback", ResponseCode: "0" });

    await dispatchStk({ ...baseInput, amountCents: 99999 });

    expect(mockInitiateSTKPush).toHaveBeenCalledWith(
      expect.objectContaining({ amountKes: 999.99 }),
    );
  });
});

describe("dispatchStk — resolvePaymentBranch only applies to the online flow", () => {
  // Regression test: resolvePaymentBranch's credential swap (branch-limited
  // delivery routing a non-Nakuru branch through Nairobi's credentials) must
  // never reach the in-store flow, which never called it originally. Applying
  // it unconditionally would silently rebill a branch-scoped admin's walk-in
  // sale against the wrong branch's credentials.
  it("calls resolvePaymentBranch for kind: online", async () => {
    mockInitiateKcbStkPush.mockResolvedValue({ CheckoutRequestID: "ws_CO_1", ResponseCode: "0" });
    await dispatchStk({ ...baseInput, kind: "online" });
    expect(mockResolvePaymentBranch).toHaveBeenCalledWith(testBranch);
  });

  it("does NOT call resolvePaymentBranch for kind: instore — uses the branch as-is", async () => {
    mockInitiateKcbStkPush.mockResolvedValue({ CheckoutRequestID: "ws_CO_1", ResponseCode: "0" });
    await dispatchStk({ ...baseInput, kind: "instore" });
    expect(mockResolvePaymentBranch).not.toHaveBeenCalled();
    expect(mockResolveKcbBranch).toHaveBeenCalledWith(testBranch);
  });
});

describe("dispatchStk — failover eligibility", () => {
  it("fails over to Daraja when the primary's token fetch returns a 500 (sentNothing=true)", async () => {
    mockInitiateKcbStkPush.mockRejectedValue(new StkSendError("KCB token fetch failed: 500", true));
    mockInitiateSTKPush.mockResolvedValue({ CheckoutRequestID: "ws_CO_fallback", ResponseCode: "0" });

    const result = await dispatchStk(baseInput);

    expect(result).toEqual({ success: true, checkoutRequestId: "ws_CO_fallback", gatewayUsed: "DARAJA" });
    expect(mockInitiateSTKPush).toHaveBeenCalledTimes(1);
  });

  it("does NOT fail over on a 2xx response with ResponseCode != 0 (sentNothing=false)", async () => {
    mockInitiateKcbStkPush.mockRejectedValue(
      new StkSendError("KCB STK push returned no CheckoutRequestID (ResponseCode=2001)", false),
    );

    const result = await dispatchStk(baseInput);

    expect(result).toEqual({
      success: false,
      reason: "KCB STK push returned no CheckoutRequestID (ResponseCode=2001)",
      gatewayAttempted: "KCB_BUNI",
    });
    expect(mockInitiateSTKPush).not.toHaveBeenCalled();
  });

  it("does NOT fail over on a 4xx from the STK endpoint (sentNothing=false)", async () => {
    mockInitiateKcbStkPush.mockRejectedValue(new StkSendError("KCB STK push failed: 401 Invalid Credentials", false));

    const result = await dispatchStk(baseInput);

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ gatewayAttempted: "KCB_BUNI" });
    expect(mockInitiateSTKPush).not.toHaveBeenCalled();
  });

  it("fails over on a non-StkSendError exception (e.g. a decrypt/config failure before any network call)", async () => {
    mockInitiateKcbStkPush.mockRejectedValue(new Error("decrypt: malformed ciphertext"));
    mockInitiateSTKPush.mockResolvedValue({ CheckoutRequestID: "ws_CO_fallback", ResponseCode: "0" });

    const result = await dispatchStk(baseInput);

    expect(result).toEqual({ success: true, checkoutRequestId: "ws_CO_fallback", gatewayUsed: "DARAJA" });
  });

  it("surfaces the PRIMARY gateway's real reason when both gateways fail", async () => {
    mockInitiateKcbStkPush.mockRejectedValue(new StkSendError("KCB token fetch failed: 500 upstream error", true));
    mockInitiateSTKPush.mockRejectedValue(new StkSendError("Daraja token fetch failed: 503", true));

    const result = await dispatchStk(baseInput);

    expect(result).toEqual({
      success: false,
      reason: "KCB token fetch failed: 500 upstream error",
      gatewayAttempted: "KCB_BUNI",
    });
  });

  it("skips the Daraja fallback quickly when the branch has no passkey/shortcode configured", async () => {
    mockInitiateKcbStkPush.mockRejectedValue(new StkSendError("KCB token fetch failed: 500", true));
    mockResolvePaymentBranch.mockImplementation(async (b: branch) => ({ ...b, passkeyEnc: null, shortcode: null }));

    const result = await dispatchStk(baseInput);

    if (result.success) throw new Error("expected failure");
    expect(result.reason).toMatch(/KCB token fetch failed/);
    expect(mockGetDarajaToken).not.toHaveBeenCalled();
    expect(mockInitiateSTKPush).not.toHaveBeenCalled();
  });
});
