/**
 * One snapshot of everything the badge evaluator needs.
 *
 * Online orders (`order`) and walk-in orders (`inStoreOrder`) are both
 * counted. Note inStoreOrder.customerUserId is a bare string with no foreign
 * key.
 */

// Reaches the database. Importing this from a client component pulls the
// Postgres driver into the browser bundle — this makes that fail loudly at
// the import instead of as a wall of pg module-not-found errors.
import "server-only";

import { db } from "@/lib/db";

export type UserStats = {
  userId: string;
  /** Merchandise value of all paid orders, in cents (delivery excluded). */
  lifetimeSpendCents: number;
  largestOrderCents: number;
};

export async function getUserStats(userId: string): Promise<UserStats> {
  const [online, inStore] = await Promise.all([
    db.order.findMany({
      where: { userId, paymentStatus: "PAID" },
      select: { subtotalKes: true, discountKes: true, pointsDiscountKes: true },
    }),
    db.inStoreOrder.findMany({
      where: { customerUserId: userId, paymentStatus: "PAID" },
      select: { subtotalKes: true, discountKes: true, pointsDiscountKes: true },
    }),
  ]);

  let lifetimeSpendCents = 0;
  let largestOrderCents = 0;

  for (const o of [...online, ...inStore]) {
    const merchCents = Math.max(0, o.subtotalKes - o.discountKes - o.pointsDiscountKes);
    lifetimeSpendCents += merchCents;
    if (merchCents > largestOrderCents) largestOrderCents = merchCents;
  }

  return { userId, lifetimeSpendCents, largestOrderCents };
}
