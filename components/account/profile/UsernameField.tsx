"use client"

import { Icon } from "@iconify/react"

interface UsernameFieldProps {
  value: string
  onChange: (v: string) => void
  usernameChanges: number
  lastUsernameChange: Date | null
}

function daysUntilAvailable(last: Date | null): number | null {
  if (!last) return null
  const days = 30 - (Date.now() - last.getTime()) / 86400000
  return days > 0 ? Math.ceil(days) : null
}

export default function UsernameField({
  value,
  onChange,
  usernameChanges,
  lastUsernameChange,
}: UsernameFieldProps) {
  const cooldownDays = daysUntilAvailable(lastUsernameChange)
  const isLocked = usernameChanges >= 10 || cooldownDays !== null

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Username
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
        disabled={isLocked}
        maxLength={20}
        placeholder="your_username"
        className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-md text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D] disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed"
      />

      {/* Policy info box */}
      <div className="flex gap-3 p-3 rounded-xl border border-neutral-200 bg-[#F9FAFB]">
        <Icon icon="lucide:user" width={16} className="text-[#15803D] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-800">
            Username changes used: {usernameChanges}/10
          </p>
          {isLocked && cooldownDays !== null ? (
            <p className="text-xs text-neutral-500 mt-0.5">
              Cooldown active — next change available in {cooldownDays} day{cooldownDays !== 1 ? "s" : ""}.
            </p>
          ) : usernameChanges >= 10 ? (
            <p className="text-xs text-red-500 mt-0.5">
              Change limit reached. No further username changes allowed.
            </p>
          ) : (
            <p className="text-xs text-neutral-500 mt-0.5">
              Remaining: {10 - usernameChanges}. A 30-day cooldown applies between changes.
              Your next update is available now.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
