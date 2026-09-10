import type { AccountUser } from "@/types/account"

/** Shared TanStack Query key/fetcher for the account profile — kept in sync
 *  across ProfileForm, AccountSidebar and BotanicalDashboardCard so a save in
 *  one place is reflected in all of them immediately (see ProfileForm.tsx's
 *  mutation onSuccess, which calls qc.setQueryData on this same key). */
export const PROFILE_QUERY_KEY = ["profile"] as const

export async function fetchProfile(): Promise<AccountUser> {
  const res = await fetch("/api/users/me")
  const json = await res.json()
  if (!json.ok) throw new Error(json.error?.message ?? "Failed to load profile")
  const data = json.data as AccountUser
  return {
    ...data,
    // Response.json() serializes Date -> ISO string; revive it so callers
    // (e.g. UsernameField's cooldown math, which calls .getTime()) always
    // get a real Date, matching the AccountUser type and the initialData
    // path (server-rendered prop, where it's already a Date).
    lastUsernameChange: data.lastUsernameChange ? new Date(data.lastUsernameChange) : null,
  }
}
