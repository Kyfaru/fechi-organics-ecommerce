"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/app/providers";

// ---------------------------------------------------------------------------
// Nav configuration
// ---------------------------------------------------------------------------
const NAV = [
  { href: "/admin", icon: "mdi:view-dashboard-outline", label: "Dashboard", exact: true },
  { href: "/admin/users", icon: "mdi:account-group-outline", label: "Users" },
  { href: "/admin/products", icon: "mdi:package-variant-closed", label: "Products" },
  { href: "/admin/orders", icon: "mdi:receipt-outline", label: "Orders" },
  { href: "/admin/customers", icon: "mdi:account-group-outline", label: "Customers" },
  { href: "/admin/contacts", icon: "mdi:email-outline", label: "Messages" },
  { href: "/admin/testimonials", icon: "mdi:star-outline", label: "Testimonials" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

async function handleSignOut(router: ReturnType<typeof useRouter>) {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  } catch {
    // Fallback: navigate anyway so the user isn't stuck
    router.push("/");
  }
}

// ---------------------------------------------------------------------------
// Shared nav link — used by both desktop sidebar and mobile drawer
// ---------------------------------------------------------------------------
function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: (typeof NAV)[number];
  pathname: string;
  onClick?: () => void;
}) {
  const active = isActive(pathname, item.href, "exact" in item ? item.exact : undefined);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={[
        "flex items-center gap-3 rounded-[8px] px-4 py-3 font-body text-[14px] transition-colors",
        active
          ? "bg-white/20 text-white font-semibold dark:bg-[#DEAE00]/20 dark:text-[#FFC800]"
          : "text-white/70 hover:bg-white/10 hover:text-white dark:text-[#ffe480]/80 dark:hover:text-[#FFE480]",
      ].join(" ")}
    >
      <Icon icon={item.icon} width={20} className="flex-shrink-0" />
      {item.label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Dark mode toggle button — shared between desktop and mobile
// ---------------------------------------------------------------------------
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      {/* Subtle separator above the toggle */}
      <div className="h-px bg-white/10 my-2" />

      <button
        onClick={toggleTheme}
        className="flex items-center gap-2 w-full px-4 py-2.5 rounded-[10px] text-white/70 hover:bg-white/10 transition-colors text-[14px] font-body dark:text-[#ffe480]/80 dark:hover:text-[#FFE480]"
        aria-label="Toggle dark mode"
      >
        <Icon
          icon={theme === "dark" ? "mdi:weather-sunny" : "mdi:weather-night"}
          width={18}
          className="flex-shrink-0"
        />
        <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar inner content — reused by desktop sidebar + mobile drawer
// ---------------------------------------------------------------------------
function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex flex-col h-full">
      {/* Brand block */}
      <div className="flex flex-col items-center py-7 px-4 border-b border-white/15">
        <Image
          src="/logo/Asset 16@5x.webp"
          alt="Fechi Organics"
          width={120}
          height={40}
          className="h-8 w-auto object-contain"
          priority
        />
        <p className="text-[#a4f690] text-[11px] tracking-widest uppercase font-body mt-1 dark:text-[#FFE480]">
          Admin Panel
        </p>
      </div>

      {/* Nav list */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onClick={onNavClick} />
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-white/15 px-3 py-4 flex flex-col gap-1">
        <Link
          href="/"
          onClick={onNavClick}
          className="flex items-center gap-3 rounded-[8px] px-4 py-3 font-body text-[14px] text-white/70 hover:bg-white/10 hover:text-white transition-colors dark:text-[#ffe480]/80 dark:hover:text-[#FFE480]"
        >
          <Icon icon="mdi:arrow-left" width={20} className="flex-shrink-0" />
          Back to Store
        </Link>

        <button
          onClick={() => handleSignOut(router)}
          className="flex items-center gap-3 rounded-[8px] px-4 py-3 font-body text-[14px] text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left dark:text-[#ffe480]/80 dark:hover:text-[#FFE480]"
        >
          <Icon icon="mdi:logout-variant" width={20} className="flex-shrink-0" />
          Sign Out
        </button>

        {/* Dark mode toggle */}
        <ThemeToggle />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Desktop sidebar — fixed, hidden below md                           */}
      {/* ------------------------------------------------------------------ */}
      <aside className="hidden md:flex md:flex-col fixed left-0 top-0 h-full w-[240px] z-30 bg-[#27731e] dark:bg-[#1a0d00]">
        <SidebarContent />
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile top bar — visible only below md                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="h-14 bg-[#27731e] dark:bg-[#1a0d00] md:hidden flex items-center justify-between px-4 sticky top-0 z-40 shadow-md">
        {/* Logo inline */}
        <Link href="/admin" className="flex items-center gap-2">
          <Image
            src="/logo/Asset 16@5x.webp"
            alt="Fechi Organics"
            width={80}
            height={28}
            className="h-7 w-auto object-contain"
          />
          <span className="text-[#a4f690] text-[11px] tracking-widest uppercase font-body dark:text-[#FFE480]">
            Admin
          </span>
        </Link>

        {/* Hamburger button */}
        <button
          aria-label="Open navigation menu"
          onClick={() => setMobileOpen(true)}
          className="w-10 h-10 flex items-center justify-center text-white rounded-[8px] hover:bg-white/15 transition-colors"
        >
          <Icon icon="mdi:menu" width={24} />
        </button>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile full-screen drawer                                          */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />

            {/* Drawer panel — slides in from left */}
            <motion.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
              className="fixed inset-0 z-50 bg-[#27731e] dark:bg-[#1a0d00] flex flex-col md:hidden"
            >
              {/* Close button */}
              <div className="flex justify-end px-4 pt-4">
                <button
                  aria-label="Close navigation menu"
                  onClick={() => setMobileOpen(false)}
                  className="w-10 h-10 flex items-center justify-center text-white rounded-[8px] hover:bg-white/15 transition-colors"
                >
                  <Icon icon="mdi:close" width={24} />
                </button>
              </div>

              {/* Reuse same nav content; close drawer on nav click */}
              <div className="flex-1 overflow-y-auto">
                <SidebarContent onNavClick={() => setMobileOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
