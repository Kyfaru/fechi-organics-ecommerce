"use client"

import { Icon } from "@iconify/react"
import type { AccountUser } from "@/types/account"

export default function AccountRightPanel({ user }: { user: AccountUser }) {
  const username = user.username || `USER_${user.id.slice(-7).toUpperCase()}`

  return (
    <div className="flex flex-col gap-4 sticky top-[calc(72px+32px)]">

      {/* Identity card */}
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

      {/* Security + Identity badges */}
      <div className="grid grid-cols-2 gap-3">
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
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
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
