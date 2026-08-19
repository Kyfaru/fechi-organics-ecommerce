/**
 * Unlocks any badge whose threshold the customer has now reached.
 *
 * A thousand badges do not need a thousand evaluators: every AUTO badge names
 * one numeric field of UserStats and a threshold, so the whole engine is a
 * lookup and a comparison. Adding badges is a data change.
 */

// Reaches the database. Importing this from a client component pulls the
// Postgres driver into the browser bundle — this makes that fail loudly at
// the import instead of as a wall of pg module-not-found errors.
import "server-only";

import { db } from "@/lib/db";
import { awardPoints } from "@/lib/points/ledger";
import { levelForBadgeCount } from "@/lib/points/levels";
import type { UserStats } from "@/lib/points/stats";
import type { StatKey } from "@/lib/points/badge-families";

export type UnlockedBadge = {
  id: string;
  name: string;
  points: number;
  rarity: string;
};

/**
 * Which badges a snapshot qualifies for, given the ones already held.
 *
 * `threshold` is BigInt in the database — the top tiers of the spend families
 * run to ~3e12, well past int32. Every threshold is still under 2^53, so
 * Number() is lossless here and lets the comparison stay ordinary arithmetic.
 */
export function qualifyingBadges(
  stats: UserStats,
  catalog: Array<{ id: string; ruleKey: string | null; threshold: number | bigint | null; grantType: string }>,
  alreadyHeld: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const b of catalog) {
    if (b.grantType !== "AUTO" || !b.ruleKey || b.threshold === null) continue;
    if (alreadyHeld.has(b.id)) continue;
    const value = stats[b.ruleKey as StatKey];
    if (typeof value === "number" && value >= Number(b.threshold)) out.push(b.id);
  }
  return out;
}

/**
 * Evaluates the whole catalog against a stats snapshot, grants what is newly
 * earned, credits the points, and recomputes the customer's level.
 */
export async function evaluateBadges(stats: UserStats): Promise<UnlockedBadge[]> {
  const [catalog, held] = await Promise.all([
    db.badge.findMany({
      where: { grantType: "AUTO" },
      select: { id: true, name: true, points: true, rarity: true, ruleKey: true, threshold: true, grantType: true },
    }),
    db.userBadge.findMany({ where: { userId: stats.userId }, select: { badgeId: true } }),
  ]);

  const heldIds = new Set(held.map((h) => h.badgeId));
  const newlyEarned = qualifyingBadges(stats, catalog, heldIds);
  if (newlyEarned.length === 0) {
    await syncLevel(stats.userId, heldIds.size);
    return [];
  }

  const byId = new Map(catalog.map((b) => [b.id, b]));
  const unlocked: UnlockedBadge[] = [];

  for (const badgeId of newlyEarned) {
    const badge = byId.get(badgeId);
    if (!badge) continue;
    try {
      await db.userBadge.create({ data: { userId: stats.userId, badgeId } });
    } catch {
      // Unique violation — another pass got there first.
      continue;
    }
    if (badge.points > 0) {
      await awardPoints({
        userId: stats.userId,
        delta: badge.points,
        reason: "BADGE_AWARD",
        refType: "badge",
        refId: badgeId,
      });
    }
    unlocked.push({ id: badgeId, name: badge.name, points: badge.points, rarity: badge.rarity });
  }

  await syncLevel(stats.userId, heldIds.size + unlocked.length);
  return unlocked;
}

async function syncLevel(userId: string, badgeCount: number): Promise<void> {
  await db.loyaltyPoints.updateMany({
    where: { userId },
    data: { badgeCount, level: levelForBadgeCount(badgeCount) },
  });
}
