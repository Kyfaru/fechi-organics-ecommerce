import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The discount cap. `promotion.maxDiscountKes` was written by issueVipCoupon()
 * but never read by resolvePromo(), so the auto-issued VIP rewards were
 * uncapped — 70% of a large order gave away an unbounded amount rather than
 * stopping at the intended ceiling.
 */

const findFirst = vi.fn();
const count = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    promotion: { findFirst: (...a: unknown[]) => findFirst(...a) },
    couponRedemption: { count: (...a: unknown[]) => count(...a) },
  },
}));

const { resolvePromo } = await import("@/lib/promo");

const KES = 100;

/** A promotion row with every field resolvePromo touches. */
function promo(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    code: "TEST",
    type: "PERCENTAGE",
    value: 70,
    minOrder: null,
    maxUses: null,
    maxUsesPerUser: 0,
    usedCount: 0,
    maxDiscountKes: null,
    status: "active",
    ...over,
  };
}

beforeEach(() => {
  findFirst.mockReset();
  count.mockReset();
  count.mockResolvedValue(0);
});

describe("resolvePromo — maxDiscountKes", () => {
  it("caps the VIP 70% reward at its ceiling on a large order", async () => {
    findFirst.mockResolvedValue(promo({ value: 70, maxDiscountKes: 35_000 * KES }));

    const r = await resolvePromo("VIP70-ABC", 500_000 * KES);

    // Uncapped this would be KSh 350,000.
    expect(r.discountKes).toBe(35_000 * KES);
  });

  it("caps the VIP 50% reward at its ceiling", async () => {
    findFirst.mockResolvedValue(promo({ value: 50, maxDiscountKes: 15_000 * KES }));
    const r = await resolvePromo("VIP50-ABC", 100_000 * KES);
    expect(r.discountKes).toBe(15_000 * KES);
  });

  it("leaves a small order untouched when it lands under the cap", async () => {
    findFirst.mockResolvedValue(promo({ value: 70, maxDiscountKes: 35_000 * KES }));
    const r = await resolvePromo("VIP70-ABC", 10_000 * KES);
    // 70% of 10,000 is 7,000 — well under the ceiling.
    expect(r.discountKes).toBe(7_000 * KES);
  });

  it("is a no-op for a coupon with no cap set", async () => {
    findFirst.mockResolvedValue(promo({ value: 10, maxDiscountKes: null }));
    const r = await resolvePromo("SAVE10", 500_000 * KES);
    expect(r.discountKes).toBe(50_000 * KES);
  });

  it("caps a FIXED coupon too", async () => {
    findFirst.mockResolvedValue(
      promo({ type: "FIXED", value: 9_000, maxDiscountKes: 2_000 * KES }),
    );
    const r = await resolvePromo("FLAT", 500_000 * KES);
    expect(r.discountKes).toBe(2_000 * KES);
  });

  it("never lets the cap turn into a discount larger than the order", async () => {
    findFirst.mockResolvedValue(promo({ type: "FIXED", value: 9_000, maxDiscountKes: 999_999 * KES }));
    const r = await resolvePromo("FLAT", 1_000 * KES);
    expect(r.discountKes).toBe(1_000 * KES);
  });

  it("does not touch free shipping", async () => {
    findFirst.mockResolvedValue(
      promo({ type: "FREE_SHIPPING", value: 0, maxDiscountKes: 100 }),
    );
    const r = await resolvePromo("FREESHIP", 50_000 * KES);
    expect(r.deliveryFree).toBe(true);
    expect(r.discountKes).toBe(0);
  });
});
