"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "@iconify/react";
import { useSession } from "@/lib/auth-client";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

// ---------------------------------------------------------------------------
// Navigation items shared between desktop sidebar and mobile tab bar
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
  {
    href: "/settings",
    icon: "mdi:account-circle-outline",
    label: "Profile & Settings",
  },
  {
    href: "/orders",
    icon: "mdi:receipt-outline",
    label: "My Orders",
  },
  {
    href: "/wishlist",
    icon: "mdi:heart-outline",
    label: "Wishlist",
  },
] as const;

// ---------------------------------------------------------------------------
// Helper: derive initials from a name string
// ---------------------------------------------------------------------------
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AccountLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout for /settings, /orders, /wishlist.
 *
 * Desktop (≥ md): fixed 250px left sidebar + main content offset.
 * Mobile (< md): horizontal sticky tab bar below the Navbar.
 *
 * Auth guard: redirects unauthenticated visitors to /login.
 *
 * Root layout does NOT include Navbar/Footer, so we wrap them here.
 */
export function AccountLayout({ children }: AccountLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Auth guard — redirect if no session once loading finishes
  useEffect(() => {
    if (!isPending && !session?.user) {
      console.info("[AccountLayout] No session — redirecting to /login");
      router.replace("/login");
    }
  }, [isPending, session, router]);

  // While session is loading, show a minimal shell
  if (isPending || !session?.user) {
    return (
      <div className="min-h-screen flex flex-col bg-[#f9f9f9] dark:bg-gray-950">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#27731e] border-t-transparent rounded-full animate-spin" />
        </div>
        <Footer />
      </div>
    );
  }

  const user = session.user;
  const displayName = user.name ?? "Account";
  const initials = getInitials(displayName);

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9f9] dark:bg-gray-950">
      <Navbar />

      <div className="flex flex-1 relative">
        {/* ------------------------------------------------------------------ */}
        {/* Desktop sidebar — hidden below md                                  */}
        {/* ------------------------------------------------------------------ */}
        <aside className="hidden md:flex flex-col fixed left-0 top-[76px] h-[calc(100vh-76px)] w-[250px] bg-white dark:bg-gray-900 border-r border-[#e2e2e2] dark:border-gray-700 z-20 overflow-y-auto">
          {/* User info */}
          <div className="px-5 pt-7 pb-6 border-b border-[#e2e2e2] dark:border-gray-700">
            <div
              aria-hidden="true"
              className="w-12 h-12 rounded-full bg-[#27731e] flex items-center justify-center mb-3"
            >
              <span className="text-white font-semibold text-[16px] leading-none">
                {initials}
              </span>
            </div>
            <p className="font-semibold text-[#1a1c1c] dark:text-white text-[15px] leading-snug truncate">
              {displayName}
            </p>
            <p className="text-[#40493c] dark:text-gray-400 text-[13px] truncate mt-0.5">
              {user.email}
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1 px-3 py-4" aria-label="Account navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-medium transition-colors duration-150",
                    isActive
                      ? "bg-[#27731e]/10 text-[#27731e]"
                      : "text-[#40493c] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon icon={item.icon} width={20} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* ------------------------------------------------------------------ */}
        {/* Mobile tab bar — visible below md                                  */}
        {/* ------------------------------------------------------------------ */}
        <div className="md:hidden fixed left-0 right-0 top-[64px] z-[45] bg-white dark:bg-gray-900 border-b border-[#e2e2e2] dark:border-gray-700">
          <nav
            className="flex overflow-x-auto scrollbar-hide px-2"
            aria-label="Account navigation"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center gap-2 px-4 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors duration-150",
                    isActive
                      ? "border-[#27731e] text-[#27731e]"
                      : "border-transparent text-[#40493c] dark:text-gray-400 hover:text-[#27731e]",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon icon={item.icon} width={18} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Main content area                                                   */}
        {/* ------------------------------------------------------------------ */}
        {/* Offset: on desktop shift right of sidebar; on mobile add top padding for tab bar */}
        <main className="flex-1 md:ml-[250px] pt-[48px] md:pt-0 min-w-0">
          {children}
        </main>
      </div>

      <div className="md:ml-[250px]">
        <Footer />
      </div>
    </div>
  );
}
