/**
 * Unit tests for lib/phone.ts — the normalization/routing helpers behind
 * lib/sms.ts's Africa's Talking (Kenya) / Twilio (everywhere else) routing.
 */

import { describe, it, expect } from "vitest";
import { normalizePhoneE164, getPhoneCountry, combineLegacyPhone } from "@/lib/phone";

describe("normalizePhoneE164", () => {
  it("normalises a local Kenyan number to E.164", () => {
    expect(normalizePhoneE164("0712345678")).toBe("+254712345678");
  });

  it("normalises a bare Kenyan number without leading 0", () => {
    expect(normalizePhoneE164("712345678")).toBe("+254712345678");
  });

  it("passes through an already-E.164 number", () => {
    expect(normalizePhoneE164("+254712345678")).toBe("+254712345678");
  });

  it("normalises a non-Kenyan E.164 number regardless of default country", () => {
    expect(normalizePhoneE164("+14155552671")).toBe("+14155552671");
  });

  it("returns null for an unparseable number", () => {
    expect(normalizePhoneE164("not-a-phone")).toBeNull();
  });
});

describe("getPhoneCountry", () => {
  it("identifies Kenya for a Kenyan E.164 number", () => {
    expect(getPhoneCountry("+254712345678")).toBe("KE");
  });

  it("identifies a non-Kenyan country for a US E.164 number", () => {
    expect(getPhoneCountry("+14155552671")).toBe("US");
  });
});

describe("combineLegacyPhone", () => {
  it("combines local digits with a dial code into E.164", () => {
    expect(combineLegacyPhone("0712345678", "+254")).toBe("+254712345678");
  });

  it("strips the leading 0 before combining", () => {
    expect(combineLegacyPhone("712345678", "+254")).toBe("+254712345678");
  });

  it("defaults to +254 when phoneCode is missing", () => {
    expect(combineLegacyPhone("0712345678", null)).toBe("+254712345678");
  });

  it("supports a non-Kenyan dial code", () => {
    expect(combineLegacyPhone("4155552671", "+1")).toBe("+14155552671");
  });
});
