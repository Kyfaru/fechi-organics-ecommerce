"use client"

import { useState, useRef, useEffect } from "react"
import { Icon } from "@iconify/react"

interface CitySelectProps {
  value: string
  onChange: (city: string) => void
  country: string
}

export default function CitySelect({ value, onChange, country }: CitySelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [cities, setCities] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const lastCountry = useRef<string>("")

  useEffect(() => {
    if (!country || country === lastCountry.current) return
    lastCountry.current = country
    setLoading(true)
    setCities([])
    fetch("/api/countries/states", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country }),
    })
      .then((r) => r.json())
      .then((data: string[]) => setCities(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [country])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const filtered = search
    ? cities.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : cities

  const disabled = !country || loading

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
        City / County
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 border border-neutral-300 rounded-md text-sm bg-white text-left focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D] disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex-1 text-neutral-400 flex items-center gap-2">
            <Icon icon="lucide:loader-2" width={14} className="animate-spin" /> Loading…
          </span>
        ) : value ? (
          <span className="flex-1 text-neutral-900 truncate">{value}</span>
        ) : (
          <span className="flex-1 text-neutral-400">
            {country ? "Select city / county" : "Select country first"}
          </span>
        )}
        <Icon icon="lucide:chevron-down" width={14} className="text-neutral-400 shrink-0" />
      </button>

      {open && cities.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-neutral-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full px-3 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-[#15803D]"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {filtered.map((city) => (
              <li key={city}>
                <button
                  type="button"
                  onClick={() => { onChange(city); setSearch(""); setOpen(false) }}
                  className={[
                    "w-full px-4 py-2 text-sm text-left hover:bg-[#F0FDF4] hover:text-[#15803D] transition-colors",
                    city === value ? "bg-[#F0FDF4] text-[#15803D] font-medium" : "text-neutral-700",
                  ].join(" ")}
                >
                  {city}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
