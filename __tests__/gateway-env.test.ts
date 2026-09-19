/**
 * Unit tests for lib/payments/gateway-env.ts — the guard that turns a
 * misconfigured M-Pesa gateway into a loud startup error instead of a silent
 * 1037 forty seconds later.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertGatewayEnv, assertBranchNotSandbox } from "@/lib/payments/gateway-env";

const ORIGINAL_ENV = { ...process.env };

// @types/node marks NODE_ENV readonly; it's a plain mutable string at
// runtime, so widen the type rather than fight the compiler over a test-only
// assignment.
function setNodeEnv(value: string) {
  (process.env as Record<string, string>).NODE_ENV = value;
}

function setProdEnv(overrides: Record<string, string | undefined> = {}) {
  setNodeEnv("production");
  process.env.KCB_BASE_URL = "https://api.buni.kcbgroup.com";
  process.env.DARAJA_ENV = "production";
  process.env.MPESA_CALLBACK_BASE_URL = "https://fechiorganics.shop";
  process.env.KCB_CALLBACK_BASE_URL = "https://fechiorganics.shop";
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("assertGatewayEnv", () => {
  it("passes with a correct production config", () => {
    setProdEnv();
    expect(() => assertGatewayEnv()).not.toThrow();
  });

  it("does nothing outside production", () => {
    setNodeEnv("development");
    delete process.env.KCB_BASE_URL;
    expect(() => assertGatewayEnv()).not.toThrow();
  });

  it("throws when KCB_BASE_URL is unset in production", () => {
    setProdEnv({ KCB_BASE_URL: undefined });
    expect(() => assertGatewayEnv()).toThrow(/KCB_BASE_URL is not set/);
  });

  it("throws when KCB_BASE_URL points at the UAT host", () => {
    setProdEnv({ KCB_BASE_URL: "https://uat.buni.kcbgroup.com" });
    expect(() => assertGatewayEnv()).toThrow(/non-production host/);
  });

  it("throws when KCB_BASE_URL contains sandbox", () => {
    setProdEnv({ KCB_BASE_URL: "https://sandbox.buni.kcbgroup.com" });
    expect(() => assertGatewayEnv()).toThrow(/non-production host/);
  });

  it("throws when DARAJA_ENV is not exactly \"production\"", () => {
    setProdEnv({ DARAJA_ENV: "sandbox" });
    expect(() => assertGatewayEnv()).toThrow(/DARAJA_ENV must be exactly "production"/);
  });

  it("throws when DARAJA_ENV is unset", () => {
    setProdEnv({ DARAJA_ENV: undefined });
    expect(() => assertGatewayEnv()).toThrow(/DARAJA_ENV must be exactly "production"/);
  });

  it("throws when the callback base is missing", () => {
    setProdEnv({ MPESA_CALLBACK_BASE_URL: undefined, KCB_CALLBACK_BASE_URL: undefined });
    expect(() => assertGatewayEnv()).toThrow(/MPESA_CALLBACK_BASE_URL/);
  });

  it("throws when the callback base is not https", () => {
    setProdEnv({ MPESA_CALLBACK_BASE_URL: "http://fechiorganics.shop" });
    expect(() => assertGatewayEnv()).toThrow(/MPESA_CALLBACK_BASE_URL/);
  });

  it("throws when the callback base stringifies through an unset variable", () => {
    setProdEnv({ MPESA_CALLBACK_BASE_URL: "https://undefined/api" });
    expect(() => assertGatewayEnv()).toThrow(/MPESA_CALLBACK_BASE_URL/);
  });

  it("falls back KCB_CALLBACK_BASE_URL to MPESA_CALLBACK_BASE_URL when unset", () => {
    setProdEnv({ KCB_CALLBACK_BASE_URL: undefined });
    expect(() => assertGatewayEnv()).not.toThrow();
  });
});

describe("assertBranchNotSandbox", () => {
  it("does nothing outside production", () => {
    setNodeEnv("development");
    expect(() =>
      assertBranchNotSandbox("branch-1", {
        daraja: { shortcode: "174379", passkey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919" },
      }),
    ).not.toThrow();
  });

  it("throws on Safaricom's public sandbox shortcode + passkey", () => {
    setNodeEnv("production");
    expect(() =>
      assertBranchNotSandbox("branch-1", {
        daraja: { shortcode: "174379", passkey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919" },
      }),
    ).toThrow(/PUBLIC sandbox/);
  });

  it("does not throw on a real-looking shortcode/passkey pair", () => {
    setNodeEnv("production");
    expect(() =>
      assertBranchNotSandbox("branch-1", {
        daraja: { shortcode: "522522", passkey: "some-real-production-passkey" },
      }),
    ).not.toThrow();
  });

  it("throws on a KCB apiKey whose JWT claims keytype=SANDBOX", () => {
    setNodeEnv("production");
    const payload = Buffer.from(JSON.stringify({ keytype: "SANDBOX", iss: "https://sandbox.buni.kcbgroup.com/oauth2/token" })).toString(
      "base64",
    );
    const fakeJwt = `header.${payload}.signature`;
    expect(() => assertBranchNotSandbox("branch-1", { kcbApiKey: fakeJwt })).toThrow(/SANDBOX credential/);
  });

  it("does not throw on a KCB apiKey whose JWT claims a production issuer", () => {
    setNodeEnv("production");
    const payload = Buffer.from(JSON.stringify({ keytype: "PRODUCTION", iss: "https://api.buni.kcbgroup.com/oauth2/token" })).toString(
      "base64",
    );
    const fakeJwt = `header.${payload}.signature`;
    expect(() => assertBranchNotSandbox("branch-1", { kcbApiKey: fakeJwt })).not.toThrow();
  });

  it("does not throw on an unparseable apiKey (fails open rather than crashing dispatch on a decode bug)", () => {
    setNodeEnv("production");
    expect(() => assertBranchNotSandbox("branch-1", { kcbApiKey: "not-a-jwt" })).not.toThrow();
  });
});
