import { describe, it, expect } from "vitest";
import { cardFeeCents } from "@/lib/payments/card-fee";

describe("cardFeeCents", () => {
  it("charges 3% for Kenya and 4% for international", () => {
    expect(cardFeeCents(100_000, false)).toBe(3_000); // KES 1,000 -> KES 30
    expect(cardFeeCents(100_000, true)).toBe(4_000); // KES 1,000 -> KES 40
  });

  it("rounds to a whole cent", () => {
    expect(cardFeeCents(12_345, false)).toBe(370); // 370.35
    expect(cardFeeCents(12_345, true)).toBe(494); // 493.8
  });

  it("charges nothing when there is nothing to pay", () => {
    expect(cardFeeCents(0, false)).toBe(0);
    expect(cardFeeCents(-5, true)).toBe(0);
  });
});
