/**
 * Small shared helpers for the post-login welcome screen — kept out of the
 * route files themselves so /api/admin/me and /api/admin/welcome/start
 * compute the "back so soon" window identically instead of drifting.
 */

/** Any return within 3 hours of the last logout gets the "back so soon" copy. */
export function computeBackSoon(lastLogoutAt: Date | null): boolean {
  if (!lastLogoutAt) return false;
  const hoursSinceLogout = (Date.now() - lastLogoutAt.getTime()) / (60 * 60 * 1000);
  return hoursSinceLogout >= 0 && hoursSinceLogout <= 3;
}

/** "customer_care" -> "Customer Care". Works for every role slug in lib/permissions.ts without a lookup table. */
export function humanizeRole(role: string): string {
  return role
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
