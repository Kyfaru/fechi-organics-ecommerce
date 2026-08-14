const COOLDOWN_DAYS = [1, 7, 14, 30] as const;
// Shorter schedule for admin self-service resets — same escalating logic,
// tighter days, so an admin can recover access faster than a customer.
export const ADMIN_COOLDOWN_DAYS = [1, 2, 3, 7] as const;
const MAX_CHANGES = 10;

export type PasswordChangeCheck =
  | { allowed: true }
  | { allowed: false; reason: "PASSWORD_CHANGE_LIMIT" }
  | { allowed: false; reason: "PASSWORD_CHANGE_TOO_SOON"; nextAllowedAt: Date; cooldownDays: number };

/**
 * Escalating cooldown between password changes: 1 day before the 1st change,
 * 7 before the 2nd, 14 before the 3rd, 30 before every change after that —
 * measured from account creation for the first change, then from the
 * previous change. Capped at 10 lifetime changes. Pass `cooldownDays` to use
 * a different schedule (e.g. ADMIN_COOLDOWN_DAYS).
 */
export function checkPasswordChangeAllowed(
  user: {
    passwordChanges: number;
    lastPasswordChange: Date | null;
    createdAt: Date;
  },
  cooldownDaysSchedule: readonly number[] = COOLDOWN_DAYS
): PasswordChangeCheck {
  if (user.passwordChanges >= MAX_CHANGES) {
    return { allowed: false, reason: "PASSWORD_CHANGE_LIMIT" };
  }

  const cooldownDays =
    cooldownDaysSchedule[Math.min(user.passwordChanges, cooldownDaysSchedule.length - 1)];
  const reference = user.lastPasswordChange ?? user.createdAt;
  const nextAllowedAt = new Date(reference.getTime() + cooldownDays * 24 * 60 * 60 * 1000);

  if (Date.now() < nextAllowedAt.getTime()) {
    return { allowed: false, reason: "PASSWORD_CHANGE_TOO_SOON", nextAllowedAt, cooldownDays };
  }

  return { allowed: true };
}
