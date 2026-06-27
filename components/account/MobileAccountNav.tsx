"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon } from "@iconify/react"

const TABS: Array<{ href: string; icon: string; label: string }> = [
  { href: "/account/profile",  icon: "lucide:user",         label: "Profile"  },
  { href: "/account/orders",   icon: "lucide:shopping-bag", label: "Orders"   },
  { href: "/account/reviews",  icon: "lucide:star",         label: "Reviews"  },
  { href: "/account/settings", icon: "lucide:settings",     label: "Settings" },
  { href: "/account/inbox",    icon: "lucide:inbox",        label: "Inbox"    },
  { href: "/account/wishlist", icon: "lucide:heart",        label: "Wishlist" },
]

export default function MobileAccountNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 flex items-center justify-around px-2 py-2 pb-safe">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/")
        const isInbox = tab.href === "/account/inbox"
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center gap-0.5 px-3 py-1 relative"
          >
            <div className={`relative p-1.5 rounded-lg transition-colors ${isActive ? "bg-[#F0FDF4]" : ""}`}>
              <Icon
                icon={tab.icon}
                width={19}
                className={isActive ? "text-[#15803D]" : "text-neutral-400"}
              />
              {isInbox && unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-[#15803D] text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <span className={`text-[9px] font-medium ${isActive ? "text-[#15803D]" : "text-neutral-400"}`}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
