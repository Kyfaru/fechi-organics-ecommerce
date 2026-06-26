"use client"

import { useState, useRef, useEffect } from "react"
import { Icon } from "@iconify/react"
import type { CountryItem } from "./CountrySelect"

interface PhoneInputProps {
  phone: string
  phoneCode: string
  onPhoneChange: (v: string) => void
  onPhoneCodeChange: (v: string) => void
  countries: CountryItem[]
}

export default function PhoneInput({
  phone,
  phoneCode,
  onPhoneChange,
  onPhoneCodeChange,
  countries,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const dialOptions = countries
    .filter((c) => c.phoneCode)
    .reduce<CountryItem[]>((acc, c) => {
      if (!acc.find((x) => x.phoneCode === c.phoneCode)) acc.push(c)
      return acc
    }, [])

  const filtered = search
    ? dialOptions.filter(
        (c) =>
          c.phoneCode.includes(search) ||
          c.name.toLowerCase().includes(search.toLowerCase())
      )
    : dialOptions

  const selected = dialOptions.find((c) => c.phoneCode === phoneCode) ?? dialOptions[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
        Phone Number
      </label>
      <div className="flex" ref={ref}>
        {/* Dial code picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-2.5 border border-r-0 border-neutral-300 rounded-l-md bg-white text-sm focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D] whitespace-nowrap"
          >
            {selected && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.flag} alt="" className="w-5 h-3.5 object-cover rounded-sm" />
            )}
            <span className="text-neutral-700">{phoneCode || selected?.phoneCode || "+???"}</span>
            <Icon icon="lucide:chevron-down" width={12} className="text-neutral-400" />
          </button>

          {open && (
            <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
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
                {filtered.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => {
                        onPhoneCodeChange(c.phoneCode)
                        setSearch("")
                        setOpen(false)
                      }}
                      className={[
                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#F0FDF4] hover:text-[#15803D] transition-colors",
                        c.phoneCode === phoneCode ? "bg-[#F0FDF4] text-[#15803D] font-medium" : "text-neutral-700",
                      ].join(" ")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.flag} alt="" className="w-5 h-3.5 object-cover rounded-sm shrink-0" />
                      <span className="text-neutral-500 w-12 shrink-0">{c.phoneCode}</span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Number input */}
        <input
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value.replace(/[^0-9+\-\s()]/g, ""))}
          placeholder="07xxxxxxxx"
          className="flex-1 px-3.5 py-2.5 border border-neutral-300 rounded-r-md text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D]"
        />
      </div>
    </div>
  )
}
