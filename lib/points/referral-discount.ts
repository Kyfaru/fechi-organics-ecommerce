/**
 * Referral codes at checkout.
 *
 * These used to be a special case: `resolvePromo` rejected them and this module
 * resolved the discount separately. That is gone — a customer's referral code
 * is now a real `promotion` row (created by `ensureLoyaltyAccount`, tagged with
 * `ownerUserId`), so the ordinary coupon path handles the discount, the usage
 * limit and the per-user cap.
 *
 * What remains is the one thing a coupon row alone cannot answer: after payment
 * succeeds, who does this code belong to, so the referral can be credited?
 */

// Reaches the database. Importing this from a client component pulls the
// Postgres driver into the browser bundle — this makes that fail loudly at
// the import instead of as a wall of pg module-not-found errors.
import "server-only";

import { db } from "@/lib/db";
import { REFERRAL_DISCOUNT_PERCENT } from "@/lib/points/rules";

// Re-exported for existing server call sites. Client components must import it
// from @/lib/points/rules directly — this module reaches the database, so
// importing it from the browser breaks the build.
export { REFERRAL_DISCOUNT_PERCENT };

/**
 * The customer who owns this coupon, or null if it is a store coupon (or the
 * code doesn't exist). Ownership is the real test — checking the code's prefix
 * would break the moment the code format changed.
 */
export async function referralOwnerForCode(code: string): Promise<string | null> {
  if (!code.trim()) return null;
  const promo = await db.promotion.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: { ownerUserId: true },
  });
  return promo?.ownerUserId ?? null;
}
