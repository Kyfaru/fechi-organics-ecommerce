import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { paymentCallbackInbox: { create: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { amountMatches, signTx, signedCallbackUrl, verifySignature } from "@/lib/payments/callback-guard";

beforeEach(() => {
  process.env.PAYMENT_CALLBACK_SECRET = "test-secret";
});

describe("callback signature", () => {
  it("round-trips: signed url carries tx+sig that verify", () => {
    const url = new URL(signedCallbackUrl("https://x.test/cb", "tx-1"));
    expect(verifySignature(url.searchParams.get("tx"), url.searchParams.get("sig"))).toBe(true);
  });

  it("rejects a forged signature, and a signature for another tx", () => {
    expect(verifySignature("tx-1", "0".repeat(32))).toBe(false);
    expect(verifySignature("tx-2", signTx("tx-1"))).toBe(false);
  });

  it("returns null (unchecked) when no tx/sig is present", () => {
    expect(verifySignature(null, null)).toBeNull();
  });

  it("leaves the URL untouched when no secret is configured", () => {
    delete process.env.PAYMENT_CALLBACK_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    expect(signedCallbackUrl("https://x.test/cb", "tx-1")).toBe("https://x.test/cb");
  });
});

describe("amountMatches", () => {
  it("compares whole KES against cents", () => {
    expect(amountMatches(1500, 150000)).toBe(true);
    expect(amountMatches("1500", 150000)).toBe(true);
    expect(amountMatches(1499, 150000)).toBe(false);
  });

  it("does not reject when the callback carries no Amount", () => {
    expect(amountMatches(undefined, 150000)).toBe(true);
  });
});
