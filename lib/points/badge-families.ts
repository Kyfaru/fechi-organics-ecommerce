/**
 * The badge catalog, as configuration.
 *
 * 20 families x 50 tiers generates 1,000+ badges from this one file. Nobody
 * hand-authors a thousand rows, and nobody writes a thousand evaluators — each
 * family names ONE field of UserStats, and a badge unlocks when that field
 * reaches the tier's threshold.
 *
 * Thresholds grow geometrically, so the top tiers are deliberately out of
 * human reach: the catalog's total point value is an unreachable ceiling by
 * design, not a target anyone is expected to approach.
 *
 * To add badges, add a family here and re-run `pnpm seed:badges`. Badge ids are
 * stable slugs, so re-seeding updates rows in place and never orphans a badge
 * somebody already earned.
 */

import type { BadgeRarity } from "@prisma/client";

/**
 * Numeric fields of UserStats a badge family may key off. Kept as a literal
 * union rather than derived from UserStats so this module stays free of any
 * import that would drag the database layer into the seed script.
 */
export type StatKey =
  | "paidOrders"
  | "lifetimeSpendCents"
  | "largestOrderCents"
  | "longestWeekStreak"
  | "monthsActive"
  | "referralsConverted"
  | "distinctCategories"
  | "distinctProducts"
  | "lifetimeEarned"
  | "lifetimeRedeemed"
  | "reviewsWritten"
  | "wishlistItems"
  | "nightOrders"
  | "earlyOrders"
  | "weekendOrders"
  | "distinctCounties"
  | "pickupOrders"
  | "deliveryOrders"
  | "blogComments"
  | "blogReactions";

export type BadgeFamily = {
  key: string;
  label: string;
  /** Shown in the achievements grid; a lucide icon name. */
  icon: string;
  statKey: StatKey;
  /** Threshold for tier 1. */
  base: number;
  /** Multiplier per tier. Tier n threshold = round(base * growth^(n-1)). */
  growth: number;
  describe: (threshold: number) => string;
};

export const TIERS_PER_FAMILY = 50;

/** Points for a tier. Steep enough that the catalog total is an unreachable ceiling. */
export function tierPoints(tier: number): number {
  return Math.round(15 * Math.pow(tier, 2.6));
}

export function tierRarity(tier: number): BadgeRarity {
  if (tier <= 10) return "COMMON";
  if (tier <= 20) return "UNCOMMON";
  if (tier <= 30) return "RARE";
  if (tier <= 40) return "EPIC";
  if (tier <= 47) return "LEGENDARY";
  return "MYTHIC";
}

export function tierThreshold(family: BadgeFamily, tier: number): number {
  return Math.max(1, Math.round(family.base * Math.pow(family.growth, tier - 1)));
}

const kes = (cents: number) => `KSh ${(cents / 100).toLocaleString()}`;

export const BADGE_FAMILIES: readonly BadgeFamily[] = [
  {
    key: "orders",
    label: "Order",
    icon: "shopping-bag",
    statKey: "paidOrders",
    base: 1,
    growth: 1.32,
    describe: (n) => `Place ${n.toLocaleString()} paid order${n === 1 ? "" : "s"}`,
  },
  {
    key: "spend",
    label: "Patron",
    icon: "wallet",
    statKey: "lifetimeSpendCents",
    base: 100_000,
    growth: 1.42,
    describe: (n) => `Spend ${kes(n)} in total`,
  },
  {
    key: "bigorder",
    label: "Grand Order",
    icon: "gem",
    statKey: "largestOrderCents",
    base: 200_000,
    growth: 1.4,
    describe: (n) => `Place a single order worth ${kes(n)}`,
  },
  {
    key: "streak",
    label: "Streak",
    icon: "flame",
    statKey: "longestWeekStreak",
    base: 2,
    growth: 1.28,
    describe: (n) => `Buy in ${n.toLocaleString()} consecutive weeks`,
  },
  {
    key: "tenure",
    label: "Rooted",
    icon: "calendar-days",
    statKey: "monthsActive",
    base: 1,
    growth: 1.3,
    describe: (n) => `Stay with Fechi for ${n.toLocaleString()} month${n === 1 ? "" : "s"}`,
  },
  {
    key: "referrals",
    label: "Ambassador",
    icon: "users",
    statKey: "referralsConverted",
    base: 1,
    growth: 1.35,
    describe: (n) => `Refer ${n.toLocaleString()} customer${n === 1 ? "" : "s"} who buy`,
  },
  {
    key: "categories",
    label: "Explorer",
    icon: "compass",
    statKey: "distinctCategories",
    base: 1,
    growth: 1.3,
    describe: (n) => `Buy from ${n.toLocaleString()} different categories`,
  },
  {
    key: "products",
    label: "Collector",
    icon: "package",
    statKey: "distinctProducts",
    base: 1,
    growth: 1.31,
    describe: (n) => `Try ${n.toLocaleString()} different products`,
  },
  {
    key: "earned",
    label: "Earner",
    icon: "sparkles",
    statKey: "lifetimeEarned",
    base: 500,
    growth: 1.4,
    describe: (n) => `Earn ${n.toLocaleString()} points in total`,
  },
  {
    key: "redeemed",
    label: "Spender",
    icon: "ticket",
    statKey: "lifetimeRedeemed",
    base: 250,
    growth: 1.4,
    describe: (n) => `Redeem ${n.toLocaleString()} points`,
  },
  {
    key: "reviews",
    label: "Critic",
    icon: "star",
    statKey: "reviewsWritten",
    base: 1,
    growth: 1.32,
    describe: (n) => `Review ${n.toLocaleString()} order${n === 1 ? "" : "s"}`,
  },
  {
    key: "wishlist",
    label: "Dreamer",
    icon: "heart",
    statKey: "wishlistItems",
    base: 1,
    growth: 1.3,
    describe: (n) => `Keep ${n.toLocaleString()} item${n === 1 ? "" : "s"} on your wishlist`,
  },
  {
    key: "night",
    label: "Night Owl",
    icon: "moon",
    statKey: "nightOrders",
    base: 1,
    growth: 1.34,
    describe: (n) => `Order ${n.toLocaleString()} time${n === 1 ? "" : "s"} between 10pm and 4am`,
  },
  {
    key: "early",
    label: "Early Riser",
    icon: "sunrise",
    statKey: "earlyOrders",
    base: 1,
    growth: 1.34,
    describe: (n) => `Order ${n.toLocaleString()} time${n === 1 ? "" : "s"} between 4am and 8am`,
  },
  {
    key: "weekend",
    label: "Weekender",
    icon: "party-popper",
    statKey: "weekendOrders",
    base: 1,
    growth: 1.33,
    describe: (n) => `Place ${n.toLocaleString()} weekend order${n === 1 ? "" : "s"}`,
  },
  {
    key: "counties",
    label: "Nomad",
    icon: "map-pin",
    statKey: "distinctCounties",
    base: 1,
    growth: 1.28,
    describe: (n) => `Take delivery in ${n.toLocaleString()} different counties`,
  },
  {
    key: "pickup",
    label: "Regular",
    icon: "store",
    statKey: "pickupOrders",
    base: 1,
    growth: 1.33,
    describe: (n) => `Collect ${n.toLocaleString()} order${n === 1 ? "" : "s"} in person`,
  },
  {
    key: "delivery",
    label: "Doorstep",
    icon: "truck",
    statKey: "deliveryOrders",
    base: 1,
    growth: 1.33,
    describe: (n) => `Have ${n.toLocaleString()} order${n === 1 ? "" : "s"} delivered`,
  },
  {
    key: "comments",
    label: "Voice",
    icon: "message-circle",
    statKey: "blogComments",
    base: 1,
    growth: 1.32,
    describe: (n) => `Leave ${n.toLocaleString()} comment${n === 1 ? "" : "s"} on the journal`,
  },
  {
    key: "reactions",
    label: "Supporter",
    icon: "thumbs-up",
    statKey: "blogReactions",
    base: 1,
    growth: 1.32,
    describe: (n) => `React to ${n.toLocaleString()} journal post${n === 1 ? "" : "s"}`,
  },
] as const;

/**
 * In-house badges. These are the only ones a super admin may grant by hand,
 * and they are worth zero points on purpose — if a hand-granted badge paid
 * points it would be a way to create points outside the unanimous grant flow.
 */
export const MANUAL_BADGES = [
  { key: "vip-pass", label: "VIP Pass", icon: "crown", description: "Invited to the Fechi Organics inner circle" },
  { key: "founding-customer", label: "Founding Customer", icon: "flag", description: "Here from the very beginning" },
  { key: "event-guest", label: "Event Guest", icon: "ticket", description: "Attended a Fechi Organics event" },
  { key: "masterclass", label: "Masterclass Graduate", icon: "graduation-cap", description: "Completed a Fechi skincare masterclass" },
  { key: "wangeci-circle", label: "Wangeci's Circle", icon: "sparkle", description: "Sat down one-to-one with Wangeci and the team" },
  { key: "brand-friend", label: "Friend of Fechi", icon: "handshake", description: "Recognised for going out of your way for us" },
  { key: "beta-tester", label: "First Taste", icon: "flask-conical", description: "Tried a product before anyone else" },
  { key: "storyteller", label: "Storyteller", icon: "book-open", description: "Shared your Fechi story with the world" },
] as const;

const ROMAN: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRoman(n: number): string {
  let out = "";
  let rest = n;
  for (const [value, numeral] of ROMAN) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

export type GeneratedBadge = {
  id: string;
  familyKey: string;
  tier: number;
  name: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
  points: number;
  grantType: "AUTO" | "MANUAL";
  ruleKey: string | null;
  threshold: number | null;
  hidden: boolean;
  sortOrder: number;
};

/** Expands the config above into the full catalog. Pure — the seed and the tests share it. */
export function generateBadgeCatalog(): GeneratedBadge[] {
  const out: GeneratedBadge[] = [];

  BADGE_FAMILIES.forEach((family, familyIndex) => {
    for (let tier = 1; tier <= TIERS_PER_FAMILY; tier++) {
      const threshold = tierThreshold(family, tier);
      out.push({
        id: `${family.key}.t${String(tier).padStart(2, "0")}`,
        familyKey: family.key,
        tier,
        name: `${family.label} ${toRoman(tier)}`,
        description: family.describe(threshold),
        icon: family.icon,
        rarity: tierRarity(tier),
        points: tierPoints(tier),
        grantType: "AUTO",
        ruleKey: family.statKey,
        threshold,
        // Past tier 30 the thresholds are far beyond anything reachable — keep
        // them out of the grid until they are within sight.
        hidden: tier > 30,
        sortOrder: familyIndex * 1000 + tier,
      });
    }
  });

  MANUAL_BADGES.forEach((b, i) => {
    out.push({
      id: `inhouse.${b.key}`,
      familyKey: "inhouse",
      tier: i + 1,
      name: b.label,
      description: b.description,
      icon: b.icon,
      rarity: "LEGENDARY",
      points: 0,
      grantType: "MANUAL",
      ruleKey: null,
      threshold: null,
      hidden: false,
      sortOrder: 900_000 + i,
    });
  });

  return out;
}
