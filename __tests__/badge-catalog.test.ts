import { describe, it, expect } from "vitest";
import {
  generateBadgeCatalog,
  BADGE_FAMILIES,
  TIERS_PER_FAMILY,
  MANUAL_BADGES,
  toRoman,
  tierRarity,
} from "@/lib/points/badge-families";
import { qualifyingBadges } from "@/lib/points/evaluate-badges";
import { levelForBadgeCount, levelProgress, LEVEL_THRESHOLDS, MAX_LEVEL } from "@/lib/points/levels";
import type { UserStats } from "@/lib/points/stats";

const catalog = generateBadgeCatalog();

describe("badge catalog", () => {
  it("generates at least 1,000 badges", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(1_000);
    expect(catalog.length).toBe(BADGE_FAMILIES.length * TIERS_PER_FAMILY + MANUAL_BADGES.length);
  });

  it("offers an unreachable ceiling of more than 50,000,000 points", () => {
    const total = catalog.reduce((s, b) => s + b.points, 0);
    expect(total).toBeGreaterThan(50_000_000);
  });

  it("gives every badge a unique, stable id", () => {
    const ids = new Set(catalog.map((b) => b.id));
    expect(ids.size).toBe(catalog.length);
    // Stability matters: re-seeding must update rows, not orphan earned badges.
    expect(generateBadgeCatalog().map((b) => b.id)).toEqual(catalog.map((b) => b.id));
  });

  it("never pays points for a hand-granted badge", () => {
    const manual = catalog.filter((b) => b.grantType === "MANUAL");
    expect(manual.length).toBe(MANUAL_BADGES.length);
    expect(manual.every((b) => b.points === 0)).toBe(true);
    // Otherwise granting a badge would be a way to mint points outside the
    // unanimous super-admin flow.
  });

  it("gives every AUTO badge a rule and a threshold", () => {
    const auto = catalog.filter((b) => b.grantType === "AUTO");
    expect(auto.every((b) => b.ruleKey !== null && b.threshold !== null)).toBe(true);
  });

  it("raises thresholds and rewards monotonically within a family", () => {
    for (const family of BADGE_FAMILIES) {
      const tiers = catalog.filter((b) => b.familyKey === family.key).sort((a, b) => a.tier - b.tier);
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].threshold!).toBeGreaterThanOrEqual(tiers[i - 1].threshold!);
        expect(tiers[i].points).toBeGreaterThan(tiers[i - 1].points);
      }
    }
  });

  it("keeps the first tier of every family reachable by a new customer", () => {
    for (const family of BADGE_FAMILIES) {
      const first = catalog.find((b) => b.familyKey === family.key && b.tier === 1)!;
      // Nothing should demand more than KSh 2,000 or 500 points on day one.
      expect(first.threshold!).toBeLessThanOrEqual(200_000);
    }
  });

  it("escalates rarity with tier", () => {
    expect(tierRarity(1)).toBe("COMMON");
    expect(tierRarity(25)).toBe("RARE");
    expect(tierRarity(50)).toBe("MYTHIC");
  });
});

describe("toRoman", () => {
  it("renders tier numbers", () => {
    expect([1, 4, 9, 14, 40, 50].map(toRoman)).toEqual(["I", "IV", "IX", "XIV", "XL", "L"]);
  });
});

describe("qualifyingBadges", () => {
  const stats = { userId: "u1", paidOrders: 3, lifetimeSpendCents: 0 } as unknown as UserStats;

  const rows = [
    { id: "orders.t01", ruleKey: "paidOrders", threshold: 1, grantType: "AUTO" },
    { id: "orders.t02", ruleKey: "paidOrders", threshold: 3, grantType: "AUTO" },
    { id: "orders.t03", ruleKey: "paidOrders", threshold: 9, grantType: "AUTO" },
    { id: "inhouse.vip-pass", ruleKey: null, threshold: null, grantType: "MANUAL" },
  ];

  it("unlocks every tier reached, not just the highest", () => {
    expect(qualifyingBadges(stats, rows, new Set())).toEqual(["orders.t01", "orders.t02"]);
  });

  it("skips badges already held", () => {
    expect(qualifyingBadges(stats, rows, new Set(["orders.t01"]))).toEqual(["orders.t02"]);
  });

  it("never auto-grants a MANUAL badge", () => {
    expect(qualifyingBadges(stats, rows, new Set())).not.toContain("inhouse.vip-pass");
  });

  it("does not unlock a threshold not yet reached", () => {
    expect(qualifyingBadges(stats, rows, new Set())).not.toContain("orders.t03");
  });
});

describe("levels", () => {
  it("starts everyone at level 1", () => {
    expect(levelForBadgeCount(0)).toBe(1);
  });

  it("rises with badge count and never falls", () => {
    let prev = 0;
    for (const n of [0, 1, 5, 20, 100, 400, 1_000]) {
      const level = levelForBadgeCount(n);
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });

  it("moves a new customer off level 1 within a handful of badges", () => {
    expect(levelForBadgeCount(3)).toBeGreaterThan(1);
  });

  it("caps at level 100 and needs the whole catalog to get there", () => {
    expect(levelForBadgeCount(10_000)).toBe(MAX_LEVEL);
    expect(LEVEL_THRESHOLDS[MAX_LEVEL - 1]).toBe(BADGE_FAMILIES.length * TIERS_PER_FAMILY);
  });

  it("reports progress toward the next level", () => {
    const p = levelProgress(3);
    expect(p.level).toBeGreaterThan(1);
    expect(p.nextLevel).toBe(p.level + 1);
    expect(p.percent).toBeGreaterThanOrEqual(0);
    expect(p.percent).toBeLessThanOrEqual(100);
    expect(p.badgesForNextLevel).toBeGreaterThan(0);
  });

  it("reports a finished bar at the cap", () => {
    expect(levelProgress(10_000)).toMatchObject({ level: MAX_LEVEL, nextLevel: null, percent: 100 });
  });
});
