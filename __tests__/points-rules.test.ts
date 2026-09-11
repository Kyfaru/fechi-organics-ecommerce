import { describe, it, expect } from "vitest";
import { earnedPointsForCents, eligibleCents, KES_PER_EARNED_POINT, CENTS_PER_POINT } from "@/lib/points/rules";

const KES = 100;

describe("earnedPointsForCents", () => {
  it("earns 1 point per KSh 120 of cash paid, floored", () => {
    expect(earnedPointsForCents(1_500 * KES)).toBe(12);
    expect(earnedPointsForCents(3_000 * KES)).toBe(25);
    expect(earnedPointsForCents(6_000 * KES)).toBe(50);
  });

  it("floors a partial point rather than rounding", () => {
    // KSh 1,510 / 120 = 12.58...
    expect(earnedPointsForCents(1_510 * KES)).toBe(12);
  });

  it("earns nothing below the KSh 120 floor", () => {
    expect(earnedPointsForCents(119 * KES)).toBe(0);
    expect(earnedPointsForCents(0)).toBe(0);
  });

  it("matches KES_PER_EARNED_POINT", () => {
    expect(earnedPointsForCents(KES_PER_EARNED_POINT * KES)).toBe(1);
  });
});

describe("redemption rate", () => {
  it("values 1 point at KSh 1", () => {
    expect(CENTS_PER_POINT).toBe(100);
  });
});

describe("eligibleCents — the self-refill guard", () => {
  it("excludes delivery and both discounts", () => {
    expect(
      eligibleCents({ subtotalKes: 20_000 * KES, discountKes: 2_000 * KES, pointsDiscountKes: 3_000 * KES }),
    ).toBe(15_000 * KES);
  });

  it("returns zero for an order paid entirely in points", () => {
    const order = { subtotalKes: 50_000 * KES, discountKes: 0, pointsDiscountKes: 50_000 * KES };
    expect(eligibleCents(order)).toBe(0);
    // The whole point: a fully points-paid order must not hand back any points.
    expect(earnedPointsForCents(eligibleCents(order))).toBe(0);
  });

  it("never goes negative when points overshoot", () => {
    expect(
      eligibleCents({ subtotalKes: 1_000 * KES, discountKes: 0, pointsDiscountKes: 5_000 * KES }),
    ).toBe(0);
  });
});
