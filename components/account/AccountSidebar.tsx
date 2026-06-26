"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon } from "@iconify/react"
import type { AccountUser } from "@/types/account"

const NAV_ITEMS = [
  { href: "/account/profile",  label: "Profile",  icon: "lucide:user"         },
  { href: "/account/orders",   label: "Orders",   icon: "lucide:shopping-bag" },
  { href: "/account/settings", label: "Settings", icon: "lucide:settings"     },
  { href: "/account/security", label: "Security", icon: "lucide:shield"       },
  { href: "/account/inbox",    label: "Inbox",    icon: "lucide:inbox", badge: true },
  { href: "/account/wishlist", label: "Wishlist", icon: "lucide:heart"        },
] as const

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function AccountSidebar({
  user,
  unreadCount = 0,
}: {
  user: AccountUser
  unreadCount?: number
}) {
  const pathname = usePathname()
  const displayName = user.name || "Account"
  const username = user.username || `USER_${user.id.slice(-7).toUpperCase()}`

  return (
    <div className="flex flex-col h-full py-7">
      {/* Header */}
      <div className="px-6 mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">
            Account Dashboard
          </span>
          <Link href="/account/settings" className="text-neutral-400 hover:text-[#15803D] transition-colors">
            <Icon icon="lucide:settings" width={15} />
          </Link>
        </div>
        <h2 className="text-xl font-bold text-neutral-900 leading-tight">My Account</h2>
      </div>

      {/* User card */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7]">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-white"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#15803D] flex items-center justify-center shrink-0 ring-2 ring-white">
              <span className="text-white text-base font-bold leading-none">
                {getInitials(displayName)}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-neutral-900 truncate leading-tight">{displayName}</p>
            <p className="text-xs text-neutral-500 truncate mt-0.5">@{username}</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-2 h-px bg-neutral-100" />

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3 flex-1" aria-label="Account navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={[
                "flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-medium transition-all duration-150",
                isActive
                  ? "bg-[#15803D] text-white shadow-sm"
                  : "text-neutral-600 hover:bg-[#F0FDF4] hover:text-[#15803D]",
              ].join(" ")}
            >
              <Icon
                icon={item.icon}
                width={18}
                className={`shrink-0 ${isActive ? "text-white" : "text-neutral-400"}`}
              />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge && unreadCount > 0 && (
                <span
                  className={[
                    "text-[11px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 leading-none",
                    isActive ? "bg-white text-[#15803D]" : "bg-[#15803D] text-white",
                  ].join(" ")}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom logout */}
      <div className="px-3 pt-3 mt-3 border-t border-neutral-100">
        <Link
          href="/logout"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-medium text-neutral-400 hover:bg-red-50 hover:text-red-500 transition-all duration-150"
        >
          <Icon icon="lucide:log-out" width={18} />
          <span>Log Out</span>
        </Link>
      </div>
    </div>
  )
}
