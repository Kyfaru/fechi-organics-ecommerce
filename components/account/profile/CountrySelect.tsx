"use client"

import { useState, useRef, useEffect } from "react"
import { Icon } from "@iconify/react"

export type CountryItem = { code: string; name: string; flag: string; phoneCode: string }

interface CountrySelectProps {
  value: string
  onChange: (name: string) => void
  countries: CountryItem[]
  label?: string
  placeholder?: string
}

export default function CountrySelect({
  value,
  onChange,
  countries,
  label = "Country",
  placeholder = "Select country",
}: CountrySelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const filtered = search
    ? countries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : countries

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const selected = countries.find((c) => c.name === value)

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 border border-neutral-300 rounded-md text-sm bg-white text-left focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D]"
      >
        {selected ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.flag} alt="" className="w-5 h-3.5 object-cover rounded-sm shrink-0" />
            <span className="flex-1 text-neutral-900 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-neutral-400">{placeholder}</span>
        )}
        <Icon icon="lucide:chevron-down" width={14} className="text-neutral-400 shrink-0" />
      </button>

      {open && (
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
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-neutral-400">No results</li>
            ) : (
              filtered.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => { onChange(c.name); setSearch(""); setOpen(false) }}
                    className={[
                      "w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-[#F0FDF4] hover:text-[#15803D] transition-colors",
                      c.name === value ? "bg-[#F0FDF4] text-[#15803D] font-medium" : "text-neutral-700",
                    ].join(" ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.flag} alt="" className="w-5 h-3.5 object-cover rounded-sm shrink-0" />
                    {c.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
