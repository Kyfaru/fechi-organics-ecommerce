"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Icon } from "@iconify/react"
import type { AccountUser } from "@/types/account"
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/account/profile-query"

export function BotanicalDashboardCard({ user: initialUser }: { user: AccountUser }) {
  // initialData means first paint uses the server-rendered prop; once
  // ProfileForm's mutation writes to this same query key, this card updates
  // instantly without needing a page reload.
  const { data: user } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    initialData: initialUser,
  })
  const username = user.username || `USER_${user.id.slice(-7).toUpperCase()}`

  return (
    <div className="bg-[#14532D] rounded-2xl p-5 text-white">
      <span className="inline-block text-[10px] font-bold uppercase tracking-widest bg-amber-500 text-white px-2.5 py-0.5 rounded-full">
        Botanical Dashboard
      </span>
      <h3 className="mt-3 text-xl font-bold leading-tight">{user.name}</h3>
      <p className="text-green-200 text-sm mt-0.5">@{username}</p>
      <div className="mt-4 space-y-2">
        <div>
          <p className="text-green-300 uppercase text-[10px] tracking-wider">Email</p>
          <p className="text-white text-xs truncate">{user.email}</p>
        </div>
        <div>
          <p className="text-green-300 uppercase text-[10px] tracking-wider">Location</p>
          <p className="text-white text-xs">
            {user.city || "—"}{user.country ? `, ${user.country}` : ""}
          </p>
        </div>
      </div>
    </div>
  )
}

type PointsSummary = {
  points: { available: number; locked: number; cashValueCents: number };
  level: { level: number; percent: number; badgesForNextLevel: number | null };
  badgeCount: number;
}

/**
 * Points + level at a glance, on the profile tab. Reuses the achievements
 * endpoint rather than adding a second one — TanStack dedupes the request
 * with the achievements page's own query.
 */
export function PointsSummaryCard() {
  const { data } = useQuery<PointsSummary>({
    queryKey: ["achievements"],
    queryFn: async () => {
      const res = await fetch("/api/account/achievements")
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load points")
      return json.data
    },
    // Shares a key with the achievements page — keep the revalidation policy
    // identical, or whichever mounts first pins a stale balance for both.
    staleTime: 0,
    refetchOnMount: "always",
  })

  if (!data) return null

  return (
    <Link
      href="/account/achievements"
      className="block bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 hover:border-[#15803D] transition-colors group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon icon="lucide:trophy" width={14} className="text-[#15803D]" />
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Fechi Points
          </p>
        </div>
        <Icon
          icon="lucide:arrow-right"
          width={14}
          className="text-neutral-300 transition-transform group-hover:translate-x-0.5"
        />
      </div>

      <p className="text-2xl font-bold text-neutral-900 dark:text-white leading-none">
        {data.points.available.toLocaleString()}
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        worth KSh {(data.points.cashValueCents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
      </p>

      {data.points.locked > 0 && (
        <p className="mt-1.5 text-[11px] text-amber-600">
          +{data.points.locked.toLocaleString()} unlock with your first order
        </p>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">
          <span>Level {data.level.level}</span>
          <span>{data.badgeCount} achievements</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-[#15803D] transition-[width] duration-300"
            style={{ width: `${data.level.percent}%` }}
          />
        </div>
      </div>
    </Link>
  )
}

export default function AccountRightPanel({
  user,
  hideExtras = false,
  className = "",
}: {
  user: AccountUser
  /** Hides the Security/Identity badges and Support Concierge card below the
   *  tablet breakpoint (1200px) — settings page only, CSS-hidden not unmounted
   *  so desktop is unaffected. */
  hideExtras?: boolean
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-4 sticky top-[calc(72px+32px)] ${className}`}>

      {/* Identity card — hidden below 1200px; a duplicate renders inline near
          the page title on mobile/tablet instead (see BotanicalDashboardCard
          usage in profile/security/settings pages). */}
      <div className="max-tablet:hidden">
        <BotanicalDashboardCard user={user} />
      </div>

      {/* Points + level */}
      <div className={hideExtras ? "max-tablet:hidden" : ""}>
        <PointsSummaryCard />
      </div>

      {/* Security + Identity badges */}
      <div className={`grid grid-cols-2 gap-3 ${hideExtras ? "max-tablet:hidden" : ""}`}>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 text-center">
          <Icon icon="lucide:shield-check" width={16} className="text-neutral-400 dark:text-neutral-500 mx-auto mb-1" />
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Security</p>
          <p className="text-sm font-semibold text-[#15803D]">Strong</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 text-center">
          <Icon icon="lucide:badge-check" width={16} className="text-neutral-400 dark:text-neutral-500 mx-auto mb-1" />
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Identity</p>
          <p className="text-sm font-semibold text-[#15803D]">Verified</p>
        </div>
      </div>

      {/* Support concierge */}
      <div className={`bg-yellow-50 border border-yellow-200 rounded-xl p-4 ${hideExtras ? "max-tablet:hidden" : ""}`}>
        <p className="text-amber-800 font-semibold text-sm">Support Concierge</p>
        <p className="text-amber-700 text-xs mt-1 leading-relaxed">
          Need help with your account details or security settings? Our support team is available through the contact page.
        </p>
        <a
          href="/contact"
          className="mt-3 block text-center bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          Start Support Session
        </a>
      </div>

    </div>
  )
}
