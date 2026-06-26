"use client"

import { useState, useTransition } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import { updateNotifications } from "@/lib/account/actions"

interface Props {
  notifBotanicalUpdates: boolean
  notifOrderTracking: boolean
  notifPersonalized: boolean
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none",
        checked ? "bg-[#15803D]" : "bg-neutral-200",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 my-0.5",
          checked ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  )
}

const TOGGLES = [
  {
    key: "notifBotanicalUpdates" as const,
    label: "Botanical Updates",
    desc: "New product launches and seasonal wellness guides.",
  },
  {
    key: "notifOrderTracking" as const,
    label: "Order Tracking",
    desc: "Real-time notifications for your shipping status.",
  },
  {
    key: "notifPersonalized" as const,
    label: "Personalised Blends",
    desc: "Curated botanical recommendations based on your usage.",
  },
]

export default function CommunicationToggles({ notifBotanicalUpdates, notifOrderTracking, notifPersonalized }: Props) {
  const [values, setValues] = useState({ notifBotanicalUpdates, notifOrderTracking, notifPersonalized })
  const [pending, start] = useTransition()

  function handleChange(key: keyof typeof values, v: boolean) {
    const next = { ...values, [key]: v }
    setValues(next)
    start(async () => {
      try {
        await updateNotifications(next)
        toast.success("Preferences saved")
      } catch {
        setValues(values) // revert
        toast.error("Failed to save")
      }
    })
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-neutral-100 flex items-center gap-2">
        <Icon icon="lucide:bell" width={16} className="text-[#15803D]" />
        <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Communication Preferences</h2>
      </div>
      <div className="divide-y divide-neutral-100">
        {TOGGLES.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between gap-4 px-6 py-5">
            <div>
              <p className="text-[15px] font-medium text-neutral-900">{label}</p>
              <p className="text-sm text-neutral-400 mt-1">{desc}</p>
            </div>
            <Toggle
              checked={values[key]}
              onChange={(v) => handleChange(key, v)}
              disabled={pending}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
