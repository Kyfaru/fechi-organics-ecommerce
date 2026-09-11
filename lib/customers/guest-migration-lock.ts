import { getRedis } from "@/lib/redis";

/**
 * Shared lock between lib/auth.ts (which renames an accountless guest row's
 * email away during signup) and find-or-create-guest.ts (which creates a
 * fresh guest row for any email it doesn't currently see). Without this,
 * there's a real window — the rename makes the original email briefly
 * "free" in the `user` table before the new signup's own row claims it —
 * where a concurrent guest checkout under that same email creates a second,
 * unrelated guest row. Whichever of the two accountless rows doesn't get
 * merged is then permanently orphaned (see lib/auth.ts's hooks.before/after
 * for the full merge design).
 *
 * Short TTL — this only needs to outlive one /sign-up/email request
 * (password hashing + a handful of DB writes), not the full 5-minute
 * migration-stash TTL.
 */
const LOCK_PREFIX = "guest-migration-lock:";
const LOCK_TTL_SECONDS = 15;

function lockKey(email: string): string {
  return `${LOCK_PREFIX}${email.trim().toLowerCase()}`;
}

/** Best-effort acquire — returns true if the lock was newly acquired. */
export async function acquireGuestMigrationLock(email: string): Promise<boolean> {
  const result = await getRedis().set(lockKey(email), "1", { nx: true, ex: LOCK_TTL_SECONDS });
  return result !== null;
}

export async function isGuestMigrationLocked(email: string): Promise<boolean> {
  const value = await getRedis().get(lockKey(email));
  return value !== null;
}
