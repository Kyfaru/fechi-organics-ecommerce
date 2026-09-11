import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/points/ledger", () => ({ awardPoints: vi.fn(), ensureLoyaltyAccount: vi.fn() }));

const { normalizeEmail, ipSubnet, findFirstString, VOID_AT, FLAG_AT } = await import(
  "@/lib/points/anti-abuse"
);

describe("normalizeEmail", () => {
  it("collapses gmail dots and plus-tags onto one mailbox", () => {
    const canonical = "janedoe@gmail.com";
    expect(normalizeEmail("jane.doe@gmail.com")).toBe(canonical);
    expect(normalizeEmail("j.a.n.e.d.o.e@gmail.com")).toBe(canonical);
    expect(normalizeEmail("janedoe+fechi2@gmail.com")).toBe(canonical);
    expect(normalizeEmail("Jane.Doe+throwaway@googlemail.com")).toBe(canonical);
  });

  it("strips plus-tags but keeps dots on non-gmail domains", () => {
    // Most providers treat dots as significant, so collapsing them would
    // wrongly merge two different people.
    expect(normalizeEmail("jane.doe+shop@outlook.com")).toBe("jane.doe@outlook.com");
  });

  it("keeps genuinely different addresses apart", () => {
    expect(normalizeEmail("jane@gmail.com")).not.toBe(normalizeEmail("john@gmail.com"));
    expect(normalizeEmail("jane@gmail.com")).not.toBe(normalizeEmail("jane@outlook.com"));
  });

  it("does not choke on a malformed address", () => {
    expect(normalizeEmail("not-an-email")).toBe("not-an-email");
  });
});

describe("ipSubnet", () => {
  it("collapses a household to one /24", () => {
    expect(ipSubnet("41.90.64.12")).toBe("41.90.64.0/24");
    expect(ipSubnet("41.90.64.200")).toBe("41.90.64.0/24");
  });

  it("keeps different networks apart", () => {
    expect(ipSubnet("41.90.64.12")).not.toBe(ipSubnet("41.90.65.12"));
  });

  it("passes through anything that is not IPv4 dotted-quad", () => {
    expect(ipSubnet("2001:db8::1")).toBe("2001:db8::1");
  });
});

describe("findFirstString — payer extraction across gateways", () => {
  it("pulls the MSISDN out of a Daraja CallbackMetadata array", () => {
    const daraja = {
      Body: {
        stkCallback: {
          ResultCode: 0,
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 1500 },
              { Name: "MpesaReceiptNumber", Value: "SFR1ABCXYZ" },
              { Name: "PhoneNumber", Value: 254712345678 },
            ],
          },
        },
      },
    };
    expect(findFirstString(daraja, ["PhoneNumber", "MSISDN"])).toBe("254712345678");
  });

  it("pulls a top-level MSISDN from a C2B payload", () => {
    expect(findFirstString({ TransID: "X1", MSISDN: "254700111222" }, ["PhoneNumber", "MSISDN"])).toBe(
      "254700111222",
    );
  });

  it("pulls the Paystack card fingerprint", () => {
    const paystack = {
      data: {
        reference: "ref_123",
        authorization: { last4: "4081", bin: "408408", signature: "SIG_2Gvc6pNuzJmj4TCchXfp" },
      },
    };
    expect(findFirstString(paystack, ["signature"])).toBe("SIG_2Gvc6pNuzJmj4TCchXfp");
  });

  it("returns null when the key is absent", () => {
    expect(findFirstString({ a: { b: 1 } }, ["signature"])).toBeNull();
  });

  it("survives null, primitives and deep nesting without throwing", () => {
    expect(findFirstString(null, ["x"])).toBeNull();
    expect(findFirstString("string", ["x"])).toBeNull();
    let deep: Record<string, unknown> = { x: "found" };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    // Bounded depth: it gives up rather than walking a pathological payload.
    expect(findFirstString(deep, ["x"])).toBeNull();
  });
});

describe("risk thresholds", () => {
  it("makes a single shared payment instrument enough to void on its own", () => {
    // PAY_MPESA and PAY_CARD are weighted at exactly VOID_AT for this reason.
    expect(VOID_AT).toBe(100);
  });

  it("flags well below the void threshold so humans can review the grey zone", () => {
    expect(FLAG_AT).toBeLessThan(VOID_AT);
  });
});
