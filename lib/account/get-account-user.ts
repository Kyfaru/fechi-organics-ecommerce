import { db } from "@/lib/db"
import { splitName } from "@/lib/name"
import type { AccountUser } from "@/types/account"

/**
 * Loads the account fields the /account/* pages and dashboard cards render,
 * straight from the DB rather than the Better Auth session object.
 *
 * Better Auth's session is cookie-cached for 5 minutes (lib/auth.ts
 * `session.cookieCache`), and lib/account/actions.ts's updateProfile() writes
 * via a raw db.user.update that bypasses Better Auth's own update pipeline —
 * so reading firstName/lastName/username/phone/country/city off
 * session.user could silently serve stale, pre-edit values. Querying the DB
 * directly here sidesteps that entirely.
 */
export async function getAccountUser(userId: string): Promise<AccountUser | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
      image: true,
      phone: true,
      phoneCode: true,
      country: true,
      city: true,
      usernameChanges: true,
      lastUsernameChange: true,
      langPreference: true,
      currencyDisplay: true,
      notifBotanicalUpdates: true,
      notifOrderTracking: true,
      notifPersonalized: true,
      twoFactorEnabled: true,
    },
  })
  if (!u) return null

  // Older/social sign-ups may have firstName/lastName still null — fall back
  // to splitting the full name so the profile form isn't blank for no reason.
  const fallback = u.firstName || u.lastName ? null : splitName(u.name)

  return {
    id: u.id,
    name: u.name,
    firstName: u.firstName ?? fallback?.firstName ?? null,
    lastName: u.lastName ?? fallback?.lastName ?? null,
    username: u.username,
    email: u.email,
    image: u.image,
    phone: u.phone,
    phoneCode: u.phoneCode,
    country: u.country,
    city: u.city,
    usernameChanges: u.usernameChanges,
    lastUsernameChange: u.lastUsernameChange,
    langPreference: u.langPreference,
    currencyDisplay: u.currencyDisplay,
    notifBotanicalUpdates: u.notifBotanicalUpdates,
    notifOrderTracking: u.notifOrderTracking,
    notifPersonalized: u.notifPersonalized,
    twoFactorEnabled: u.twoFactorEnabled,
  }
}
