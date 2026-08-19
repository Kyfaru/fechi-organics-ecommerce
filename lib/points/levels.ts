/**
 * Level is driven by how many achievements a customer has unlocked, not by
 * their point balance — points are spendable, and a level that fell when you
 * spent would punish using the thing.
 *
 * The curve is deliberately front-loaded: the first few levels arrive quickly
 * so a new customer sees movement, and level 100 needs the entire catalog,
 * which nobody is expected to reach.
 */

import { BADGE_FAMILIES, TIERS_PER_FAMILY } from "@/lib/points/badge-families";

export const MAX_LEVEL = 100;

const TOTAL_AUTO_BADGES = BADGE_FAMILIES.length * TIERS_PER_FAMILY;

/**
 * Badges needed to reach each level. Index 0 is level 1 (zero badges).
 *
 * The raw power curve rounds to zero for the first dozen levels, which would
 * put a customer with no badges on level 2 — the `Math.max(i, ...)` floor keeps
 * the ladder strictly increasing so early levels cost one badge each.
 */
export const LEVEL_THRESHOLDS: readonly number[] = Array.from({ length: MAX_LEVEL }, (_, i) =>
  i === 0 ? 0 : Math.max(i, Math.round(TOTAL_AUTO_BADGES * Math.pow(i / (MAX_LEVEL - 1), 1.8))),
);

export function levelForBadgeCount(badgeCount: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (badgeCount >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

/** Badges still needed for the next level, and how far through the current one they are. */
export function levelProgress(badgeCount: number): {
  level: number;
  nextLevel: number | null;
  badgesIntoLevel: number;
  badgesForNextLevel: number | null;
  percent: number;
} {
  const level = levelForBadgeCount(badgeCount);
  if (level >= MAX_LEVEL) {
    return { level, nextLevel: null, badgesIntoLevel: 0, badgesForNextLevel: null, percent: 100 };
  }
  const floor = LEVEL_THRESHOLDS[level - 1];
  const ceiling = LEVEL_THRESHOLDS[level];
  const span = Math.max(1, ceiling - floor);
  const into = badgeCount - floor;
  return {
    level,
    nextLevel: level + 1,
    badgesIntoLevel: into,
    badgesForNextLevel: ceiling - badgeCount,
    percent: Math.min(100, Math.round((into / span) * 100)),
  };
}
