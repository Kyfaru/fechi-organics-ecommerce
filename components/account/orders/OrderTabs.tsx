"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"

const TABS = [
  { id: "all", label: "All Orders" },
  { id: "ongoing", label: "Ongoing" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
] as const

export default function OrderTabs({ active }: { active: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", tab)
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={[
            "px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150",
            active === t.id
              ? "bg-white text-[#15803D] shadow-sm font-semibold"
              : "text-neutral-500 hover:text-neutral-800",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
