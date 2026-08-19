import { describe, it, expect } from "vitest";
import {
  orderBasePoints,
  valueTierFor,
  eligibleCents,
  isoWeekIndex,
  monthIndex,
  consecutiveRunEndingAt,
  streakAwards,
  VALUE_TIERS,
} from "@/lib/points/rules";

const KES = 100;

describe("orderBasePoints", () => {
  it("decays 700 -> 250 over the first ten orders", () => {
    const got = Array.from({ length: 10 }, (_, i) => orderBasePoints(i + 1));
    expect(got).toEqual([700, 650, 600, 550, 500, 450, 400, 350, 300, 250]);
  });

  it("holds at 200 for orders 11-49", () => {
    expect(orderBasePoints(11)).toBe(200);
    expect(orderBasePoints(30)).toBe(200);
    expect(orderBasePoints(49)).toBe(200);
  });

  it("rises to 300 from order 50 onward", () => {
    expect(orderBasePoints(50)).toBe(300);
    expect(orderBasePoints(500)).toBe(300);
  });

  it("never awards for a non-order", () => {
    expect(orderBasePoints(0)).toBe(0);
  });
});

describe("valueTierFor", () => {
  it("awards nothing below the 15k floor", () => {
    expect(valueTierFor(14_999 * KES)).toBeNull();
  });

  it("matches each band at its exact floor", () => {
    expect(valueTierFor(15_000 * KES)?.points).toBe(1_000);
    expect(valueTierFor(25_000 * KES)?.points).toBe(1_500);
    expect(valueTierFor(50_000 * KES)?.points).toBe(5_000);
    expect(valueTierFor(100_000 * KES)?.points).toBe(20_000);
    expect(valueTierFor(250_000 * KES)?.points).toBe(50_000);
  });

  it("takes only the highest band, never the sum", () => {
    const tier = valueTierFor(300_000 * KES);
    expect(tier?.points).toBe(50_000);
    const everyBandSummed = VALUE_TIERS.reduce((s, t) => s + t.points, 0);
    expect(tier?.points).toBeLessThan(everyBandSummed);
  });

  it("attaches VIP perks only to the top two bands", () => {
    expect(valueTierFor(50_000 * KES)?.perk).toBeNull();
    expect(valueTierFor(100_000 * KES)?.perk).toBe("VIP_1");
    expect(valueTierFor(250_000 * KES)?.perk).toBe("VIP_2");
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
    // The whole point: a fully points-paid 50k order must not hand back 5,000.
    expect(valueTierFor(eligibleCents(order))).toBeNull();
  });

  it("never goes negative when points overshoot", () => {
    expect(
      eligibleCents({ subtotalKes: 1_000 * KES, discountKes: 0, pointsDiscountKes: 5_000 * KES }),
    ).toBe(0);
  });
});

describe("EAT period bucketing", () => {
  it("puts a Monday and the following Sunday in the same ISO week", () => {
    // 2026-08-17 is a Monday; 2026-08-23 the Sunday that closes that week.
    expect(isoWeekIndex(new Date("2026-08-17T09:00:00Z"))).toBe(
      isoWeekIndex(new Date("2026-08-23T09:00:00Z")),
    );
  });

  it("rolls to a new week on Monday", () => {
    expect(isoWeekIndex(new Date("2026-08-24T09:00:00Z"))).toBe(
      isoWeekIndex(new Date("2026-08-17T09:00:00Z")) + 1,
    );
  });

  it("uses Nairobi time, not UTC, at the day boundary", () => {
    // 22:30 UTC on a Sunday is 01:30 Monday in EAT — already the next week.
    const sundayLateUtc = new Date("2026-08-23T22:30:00Z");
    const sundayMorning = new Date("2026-08-23T06:00:00Z");
    expect(isoWeekIndex(sundayLateUtc)).toBe(isoWeekIndex(sundayMorning) + 1);
  });

  it("increments monthIndex by one across a month boundary", () => {
    expect(monthIndex(new Date("2026-09-01T09:00:00Z"))).toBe(
      monthIndex(new Date("2026-08-15T09:00:00Z")) + 1,
    );
  });
});

describe("consecutiveRunEndingAt", () => {
  it("counts an unbroken run back from the current period", () => {
    expect(consecutiveRunEndingAt([10, 9, 8, 7], 10)).toBe(4);
  });

  it("stops at the first gap", () => {
    expect(consecutiveRunEndingAt([10, 9, 7, 6], 10)).toBe(2);
  });

  it("is zero when the current period has no order", () => {
    expect(consecutiveRunEndingAt([9, 8], 10)).toBe(0);
  });

  it("ignores duplicates and ordering", () => {
    expect(consecutiveRunEndingAt([8, 10, 9, 10, 9], 10)).toBe(3);
  });
});

describe("streakAwards", () => {
  const orderedAt = new Date("2026-08-17T09:00:00Z");
  const w = isoWeekIndex(orderedAt);
  const m = monthIndex(orderedAt);
  const base = { orderedAt, priorFourWeekAwards: 0, hasSixMonthWeekly: false, hasSixMonthMonthly: false };

  it("awards 500 on the fourth consecutive week", () => {
    const got = streakAwards({ ...base, weekIndices: [w, w - 1, w - 2, w - 3], monthIndices: [m] });
    expect(got).toEqual([expect.objectContaining({ reason: "STREAK_4W", points: 500 })]);
  });

  it("awards nothing on the third week", () => {
    expect(streakAwards({ ...base, weekIndices: [w, w - 1, w - 2], monthIndices: [m] })).toEqual([]);
  });

  it("stops after four lifetime four-week awards", () => {
    expect(
      streakAwards({
        ...base,
        priorFourWeekAwards: 4,
        weekIndices: [w, w - 1, w - 2, w - 3],
        monthIndices: [m],
      }),
    ).toEqual([]);
  });

  it("awards 3,000 for twenty-six unbroken weeks", () => {
    const weeks = Array.from({ length: 26 }, (_, i) => w - i);
    const got = streakAwards({ ...base, weekIndices: weeks, monthIndices: [m] });
    expect(got.map((a) => a.reason)).toContain("STREAK_6M_WEEKLY");
  });

  it("awards the 2,000 monthly streak when weeks were missed", () => {
    const months = Array.from({ length: 6 }, (_, i) => m - i);
    const got = streakAwards({ ...base, weekIndices: [w], monthIndices: months });
    expect(got).toEqual([expect.objectContaining({ reason: "STREAK_6M_MONTHLY", points: 2_000 })]);
  });

  it("never pays both six-month awards to the same customer", () => {
    const weeks = Array.from({ length: 26 }, (_, i) => w - i);
    const months = Array.from({ length: 6 }, (_, i) => m - i);
    const reasons = streakAwards({ ...base, weekIndices: weeks, monthIndices: months }).map((a) => a.reason);
    expect(reasons).toContain("STREAK_6M_WEEKLY");
    expect(reasons).not.toContain("STREAK_6M_MONTHLY");
  });

  it("does not re-award a six-month streak already earned", () => {
    const months = Array.from({ length: 8 }, (_, i) => m - i);
    expect(
      streakAwards({ ...base, hasSixMonthMonthly: true, weekIndices: [w], monthIndices: months }),
    ).toEqual([]);
  });
});
