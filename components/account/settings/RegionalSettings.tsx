"use client"

import { useState, useTransition } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import { updateRegional } from "@/lib/account/actions"

const LANGUAGES = [
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "sw-KE", label: "Kiswahili (Kenya)" },
]

const CURRENCIES = [
  { value: "KES", label: "KES (Kenyan Shilling)" },
  { value: "USD", label: "USD (US Dollar)" },
  { value: "GBP", label: "GBP (British Pound)" },
]

function selectClass() {
  return "w-full px-4 py-3 border border-neutral-300 rounded-lg text-[15px] bg-white text-neutral-900 focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D] appearance-none"
}

export default function RegionalSettings({
  langPreference,
  currencyDisplay,
}: {
  langPreference: string
  currencyDisplay: string
}) {
  const [lang, setLang] = useState(langPreference)
  const [currency, setCurrency] = useState(currencyDisplay)
  const [pending, start] = useTransition()

  function handleSave() {
    start(async () => {
      try {
        await updateRegional({ langPreference: lang, currencyDisplay: currency })
        toast.success("Regional settings saved")
      } catch {
        toast.error("Failed to save")
      }
    })
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-neutral-100 flex items-center gap-2">
        <Icon icon="lucide:globe" width={16} className="text-[#15803D]" />
        <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Regional & Language</h2>
      </div>
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-neutral-600 mb-2">
              Primary Language
            </label>
            <div className="relative">
              <select value={lang} onChange={(e) => setLang(e.target.value)} className={selectClass()}>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <Icon icon="lucide:chevron-down" width={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-neutral-600 mb-2">
              Currency Display
            </label>
            <div className="relative">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectClass()}>
                {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <Icon icon="lucide:chevron-down" width={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#15803D] hover:bg-[#16A34A] text-white text-[15px] font-semibold transition-colors disabled:opacity-50"
          >
            {pending && <Icon icon="lucide:loader-2" width={14} className="animate-spin" />}
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  )
}
