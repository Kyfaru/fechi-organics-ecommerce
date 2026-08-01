"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import "@/lib/iconify-offline";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Tooltip } from "@/components/ui/Tooltip";
import { LogoutModal } from "@/components/ui/LogoutModal";
import { NavbarWhatsAppButton } from "@/components/ui/NavbarWhatsAppButton";
import { useSession, signOut } from "@/lib/auth-client";
import { readSessionCache, writeSessionCache, clearSessionCache } from "@/lib/session-cache";
import { useTheme, clearPersistedQueryCache } from "@/app/providers";
import { posthog } from "@/lib/posthog";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { GlobalSearchModal, type SearchResult } from "@/components/ui/GlobalSearchModal";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface NavUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

// ── ProfileTrigger ───────────────────────────────────────────────────────────

/**
 * Shows the logged-in user's avatar + name + email and a dropdown menu.
 * Closes when the user clicks outside the [data-profile-area] boundary.
 */
function ProfileTrigger({
  user,
  onLogout,
  unreadCount = 0,
}: {
  user: NavUser;
  onLogout: () => void;
  unreadCount?: number;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const displayName = user.name ?? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ?? "Account";
  const initial = (displayName[0] ?? "A").toUpperCase();

  // Close dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function handle(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-area]")) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [profileOpen]);

  return (
    <div className="relative" data-profile-area>
      <button
        onClick={() => setProfileOpen((v) => !v)}
        className="flex items-center gap-2 h-[44px] px-3 rounded-[40px] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Open profile menu"
      >
        {/* Avatar */}
        <span className="w-8 h-8 rounded-full bg-[#27731e] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          {initial}
        </span>
        {/* Name + email */}
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[14px] font-bold text-[#1a1c1c] dark:text-white whitespace-nowrap">
            {displayName}
          </span>
          {user.email && (
            <span className="text-[12px] text-[#a1a1a1] whitespace-nowrap max-w-[140px] truncate">
              {user.email}
            </span>
          )}
        </span>
        <Icon icon="mdi:chevron-down" width={18} className="text-[#a1a1a1] flex-shrink-0" />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {profileOpen && (
          <motion.div
            key="profile-dropdown"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 min-w-[200px] bg-white dark:bg-[#1a1c1c] rounded-[16px] shadow-xl border border-[#e2e2e2] dark:border-[#2a2a2a] overflow-hidden"
          >
            <div className="py-1">
              <DropdownLink
                href="/account/wishlist"
                icon="mdi:heart-outline"
                label="Wishlist"
                onClick={() => setProfileOpen(false)}
              />
              <DropdownLink
                href="/account/orders"
                icon="mdi:receipt-outline"
                label="My Orders"
                onClick={() => setProfileOpen(false)}
              />
              <DropdownLink
                href="/account/inbox"
                icon="mdi:inbox-outline"
                label={unreadCount > 0 ? `Inbox (${unreadCount})` : "Inbox"}
                onClick={() => setProfileOpen(false)}
              />
              <DropdownLink
                href="/account"
                icon="mdi:cog-outline"
                label="Settings"
                onClick={() => setProfileOpen(false)}
              />
              <hr className="border-[#e2e2e2] dark:border-[#2a2a2a] my-1" />
              <button
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-body text-[#ef4444] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <Icon icon="mdi:logout" width={18} />
                Log Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Single item row inside the profile dropdown. */
function DropdownLink({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-body text-[#1a1c1c] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <Icon icon={icon} width={18} className="text-[#555]  dark:text-gray-400" />
      {label}
    </Link>
  );
}

// ── Navbar ───────────────────────────────────────────────────────────────────

export function Navbar({ flat = false }: { flat?: boolean } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(flat);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { theme, toggleTheme } = useTheme();

  const { data: session, isPending: sessionPending } = useSession();
  // Cast to NavUser: Better Auth's session.user type omits additionalFields
  // (firstName, lastName) at the type level but they are present at runtime.
  // role comes from the admin plugin and isn't part of NavUser (display-only
  // concern), so it's read separately below for the cache write.
  const liveUser = (session?.user as NavUser | undefined) ?? null;
  const liveRole = (session?.user as { role?: string } | undefined)?.role ?? null;

  // Instant-paint cache: on first mount (server render and the client's
  // hydration pass) there is no way to read localStorage without risking a
  // hydration mismatch, so both start out rendering "logged out" — identical
  // to the server. Once mounted, a useEffect (below) reads the cache, so a
  // returning user's profile paints the moment that effect runs instead of
  // waiting on the live session's DB round-trip.
  const [hasMounted, setHasMounted] = useState(false);
  const [cachedDisplay, setCachedDisplay] = useState<{ name: string; image: string | null } | null>(null);

  useEffect(() => {
    setHasMounted(true);
    const cached = readSessionCache();
    if (cached) setCachedDisplay({ name: cached.name, image: cached.image });
  }, []);

  // While the live session is still resolving, prefer the cache (if any) so
  // returning users see their profile immediately instead of a "Log in"
  // flash. Once sessionPending is false, the live session is always the
  // source of truth — logged in or out — the cache never overrides it.
  const user: NavUser | null = !hasMounted ? null : sessionPending ? cachedDisplay : liveUser;

  // Keep the cache in sync with whatever the live session actually says.
  // Runs every time useSession() finishes resolving: writes fresh display
  // data on login, and — critically — clears the cache on logout (this tab)
  // or once a logout/session-expiry from another tab is next noticed here,
  // so a stale name/avatar never lingers past the real session state.
  useEffect(() => {
    if (sessionPending) return;
    if (liveUser) {
      writeSessionCache({
        name: liveUser.name || `${liveUser.firstName ?? ""} ${liveUser.lastName ?? ""}`.trim() || "Account",
        image: liveUser.image ?? null,
        role: liveRole ?? "client",
      });
    } else {
      clearSessionCache();
    }
  }, [sessionPending, liveUser, liveRole]);

  const { data: cartData } = useQuery<{ ok: boolean; data: { itemCount: number } }>({
    queryKey: ["cart"],
    queryFn: () => fetch("/api/cart").then((r) => r.json()),
    staleTime: 0,
  });
  const cartCount = cartData?.data?.itemCount ?? 0;

  const unreadCount = useUnreadCount();

  // Transition from floating pill → flush bar after scrolling past 120 px
  useEffect(() => {
    if (flat) return;
    function onScroll() {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      setScrolled(scrollY > 120);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [flat]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  // Close search when clicking outside the search area
  useEffect(() => {
    if (!searchOpen) return;
    function handle(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-search-area]")) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [searchOpen]);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const { data: searchData, isFetching: searchLoading } = useQuery<{ ok: boolean; data: { results: SearchResult[] } }>({
    queryKey: ["global-search", debouncedSearch],
    queryFn: () => fetch(`/api/search?q=${encodeURIComponent(debouncedSearch)}`).then((r) => r.json()),
    enabled: debouncedSearch.trim().length >= 2,
  });
  const searchResults = searchData?.data?.results ?? [];

  function handleSelectSearchResult(result: SearchResult) {
    setSearchOpen(false);
    setSearchQuery("");
    router.push(result.url);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchResults[0]) {
      handleSelectSearchResult(searchResults[0]);
      return;
    }
    setSearchOpen(false);
    setSearchQuery("");
  }

  async function handleLogoutConfirm() {
    posthog.capture("logout_clicked");
    posthog.reset();
    await signOut();
    clearPersistedQueryCache();
    router.push("/");
  }

  return (
    <>
      {/* Spacer so content below is not hidden under the fixed navbar */}
      <div
        aria-hidden
        className={`hidden md:block transition-[height] duration-300 ${
          flat || scrolled ? "h-[76px]" : "h-[0px]"
        }`}
      />

      {/* ── Desktop Navbar (always fixed) ── */}
      <nav
        className={[
          "hidden md:flex items-center justify-between h-[76px] bg-white/95 dark:bg-[#111]/95 px-8 shadow-sm",
          "fixed z-9999 transition-all duration-300 backdrop-blur-sm",
          flat
            ? "top-0 left-0 right-0 rounded-none shadow-sm"
            : scrolled
            ? "top-4 left-[5px] right-[5px] rounded-none shadow-md"
            : "top-[2em] left-12 right-12 rounded-[40px]",
        ].join(" ")}
      >
        {/* Logo */}
        <Link href="/" className="flex-shrink-0">
          <Image
            src="/logo/text-only-black.webp"
            alt="Fechi Organics"
            width={120}
            height={42}
            className="object-contain h-[33px] w-auto dark:hidden"
            priority
          />
          <Image
            src="/logo/text-only-white.webp"
            alt="Fechi Organics"
            width={120}
            height={42}
            className="object-contain h-[33px] w-auto hidden dark:block"
            priority
          />
        </Link>

        {/* Nav links — always visible */}
        <ul className="flex items-center gap-8 list-none m-0 p-0">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => posthog.capture("nav_link_clicked", { link: link.label, href: link.href, source_path: pathname })}
                className={[
                  "relative group text-[16px] tracking-[0.8px] transition-colors font-body",
                  "after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:bg-[#27731e] after:origin-left after:transition-all after:duration-300",
                  pathname === link.href
                    ? "text-[#27731e] font-semibold after:w-full"
                    : "text-black dark:text-white hover:text-[#27731e] after:w-0 group-hover:after:w-full",
                ].join(" ")}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right actions */}
        <div className="flex items-center gap-3 relative" data-search-area>
          {/* Search input — absolutely positioned so it overlays without pushing other elements */}
          <AnimatePresence>
            {searchOpen && (
              <motion.form
                key="search-form"
                initial={{ opacity: 0, width: 40 }}
                animate={{ opacity: 1, width: 260 }}
                exit={{ opacity: 0, width: 40 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                onSubmit={handleSearchSubmit}
                className="absolute top-1/2 -translate-y-1/2 z-40"
              >
                <div className="relative flex items-center">
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products..."
                    className="w-full h-10 pl-4 pr-12 border border-[#c0cab8] rounded-full text-[14px] font-body outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] bg-white shadow-sm"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 flex items-center justify-center w-7 h-7 rounded-full bg-[#27731e] text-white"
                    aria-label="Search"
                  >
                    <Icon icon="mdi:magnify" width={16} />
                  </button>
                  <GlobalSearchModal
                    query={searchQuery}
                    results={searchResults}
                    loading={searchLoading}
                    onSelect={handleSelectSearchResult}
                  />
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Search toggle — always visible */}
          <Tooltip label={searchOpen ? "Close" : "Search"}>
            <button
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setSearchQuery("");
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors relative z-30"
              aria-label={searchOpen ? "Close search" : "Open search"}
            >
              <Icon
                icon={searchOpen ? "mdi:close" : "mdi:magnify"}
                width={22}
                className="text-[#1a1c1c] dark:text-white"
              />
            </button>
          </Tooltip>

          {/* WhatsApp */}
          <Tooltip label="WhatsApp">
            <NavbarWhatsAppButton />
          </Tooltip>

          {/* Cart */}
          <Tooltip label="Cart">
            <Link
              href="/cart"
              className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Shopping cart"
            >
              <Icon icon="uil:cart" width={22} className="text-[#1a1c1c] dark:text-white" />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 min-w-[15px] h-[15px] bg-[#FFC800] text-black text-[7px] font-bold rounded-full border-2 border-white flex items-center justify-center px-1 leading-none">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </Link>
          </Tooltip>

          {/* Notifications bell — logged-in users only */}
          {user && (
            <Tooltip label="Inbox">
              <Link
                href="/account/inbox"
                className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Notifications"
              >
                <Icon icon="lucide:bell" width={20} className="text-[#1a1c1c] dark:text-white" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                )}
              </Link>
            </Tooltip>
          )}

          {/* Dark mode toggle */}
          <Tooltip label={theme === "dark" ? "Light mode" : "Dark mode"}>
            <button
              onClick={toggleTheme}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              <Icon
                icon={theme === "dark" ? "iconamoon:mode-light" : "mdi:weather-night"}
                width={20}
                className="text-[#1a1c1c] dark:text-white"
              />
            </button>
          </Tooltip>

          {/* Profile trigger or Log in */}
          {user ? (
            <ProfileTrigger user={user} onLogout={() => setLogoutModalOpen(true)} unreadCount={unreadCount} />
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 bg-[#27731e] text-white rounded-[40px] px-5 h-[44px] text-[16px] tracking-[-0.16px] font-body hover:bg-[#045a03] transition-colors"
            >
              Log in
              <Icon icon="mdi:chevron-right" width={16} />
            </Link>
          )}
        </div>
      </nav>

      {/* Mobile spacer */}
      <div aria-hidden className="md:hidden h-16" />

      {/* ── Mobile Navbar (fixed) ── */}
      <nav className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-16 bg-white dark:bg-[#111] px-4 shadow-sm">
        <Link href="/">
          <Image
            src="/logo/Asset 16@5x.webp"
            alt="Fechi Organics"
            width={100}
            height={35}
            className="object-contain h-8 w-auto"
          />
        </Link>
        <div className="flex items-center gap-2">
          <NavbarWhatsAppButton variant="mobile" />
          <Link href="/cart" className="relative p-2" aria-label="Cart">
            <Icon icon="solar:cart-large-4-linear" width={22} className="text-[#1a1c1c] dark:text-white" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-[#27731e] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
          {user && (
            <Link href="/account/inbox" className="relative p-2" aria-label="Notifications">
              <Icon icon="lucide:bell" width={20} className="text-[#1a1c1c] dark:text-white" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Link>
          )}
          {user && (
            <Link
              href="/account"
              className="relative w-8 h-8 rounded-full border-2 border-[#27731e] overflow-hidden flex items-center justify-center flex-shrink-0"
              aria-label="Account settings"
            >
              {user.image ? (
                <Image src={user.image} alt={user.name ?? "Account"} fill sizes="32px" className="object-cover" />
              ) : (
                <span className="w-full h-full bg-[#27731e] text-white text-xs font-bold flex items-center justify-center">
                  {((user.name ?? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()) || "A")[0].toUpperCase()}
                </span>
              )}
            </Link>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2"
            aria-label="Menu"
          >
            <Icon
              icon={mobileOpen ? "mdi:close" : "mdi:menu"}
              width={24}
              className="text-[#1a1c1c] dark:text-white"
            />
          </button>
        </div>
      </nav>

      {/* ── Mobile menu: top-right anchored modal ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Dimmed backdrop */}
            <motion.div
              key="mobile-menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-black/30 md:hidden"
              onClick={() => setMobileOpen(false)}
            />

            <motion.div
              key="mobile-menu-modal"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="fixed top-16 right-4 z-[70] w-[300px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-[24px] bg-white dark:bg-[#111] shadow-xl md:hidden"
            >
              {/* Search */}
              <div className="p-4 pb-3 relative" data-search-area>
                <form onSubmit={handleSearchSubmit} className="relative">
                  <Icon icon="mdi:magnify" width={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1a1]" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products..."
                    className="w-full h-11 pl-10 pr-4 border border-[#e2e2e2] dark:border-[#2a2a2a] rounded-full text-[14px] font-body outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] bg-white dark:bg-gray-900 dark:text-white"
                  />
                  <GlobalSearchModal
                    query={searchQuery}
                    results={searchResults}
                    loading={searchLoading}
                    onSelect={(result) => {
                      setMobileOpen(false);
                      handleSelectSearchResult(result);
                    }}
                  />
                </form>
              </div>

              {/* Nav links */}
              <div className="px-3 pb-2">
                {NAV_LINKS.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => {
                        setMobileOpen(false);
                        posthog.capture("nav_link_clicked", { link: link.label, href: link.href, source_path: pathname });
                      }}
                      className={[
                        "flex items-center justify-between px-4 py-3 rounded-xl text-[15px] font-body transition-colors",
                        active
                          ? "bg-[#e8fce3] dark:bg-green-950/30 text-[#27731e] font-semibold"
                          : "text-[#1a1c1c] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800",
                      ].join(" ")}
                    >
                      {link.label}
                      <Icon icon="mdi:chevron-right" width={16} className={active ? "text-[#27731e]" : "text-[#c4c4c4]"} />
                    </Link>
                  );
                })}
              </div>

              {/* Appearance */}
              <div className="mx-3 mb-2 flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-3">
                  <Icon icon={theme === "dark" ? "mdi:weather-night" : "iconamoon:mode-light"} width={20} className="text-[#27731e]" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[14px] font-semibold text-[#1a1c1c] dark:text-white">Appearance</span>
                    <span className="text-[12px] text-[#a1a1a1]">Toggle between modes</span>
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  className="px-3 py-1.5 rounded-full border border-[#e2e2e2] dark:border-[#2a2a2a] text-[13px] font-body text-[#1a1c1c] dark:text-white bg-white dark:bg-gray-800"
                >
                  {theme === "dark" ? "Dark" : "Light"}
                </button>
              </div>

              {/* Account section */}
              {user ? (
                <div className="mx-3 mb-3 pt-3 border-t border-[#e2e2e2] dark:border-[#2a2a2a]">
                  <div className="flex items-center gap-3 px-1 mb-2">
                    <span className="w-10 h-10 rounded-full bg-[#27731e] text-white text-base font-bold flex items-center justify-center flex-shrink-0">
                      {((user.name ?? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()) || "A")[0].toUpperCase()}
                    </span>
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className="text-[15px] font-bold text-[#1a1c1c] dark:text-white truncate">
                        {user.name ?? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()}
                      </span>
                      {user.email && (
                        <span className="text-[12px] text-[#a1a1a1] truncate">{user.email}</span>
                      )}
                    </div>
                  </div>
                  <DropdownLink href="/account/orders" icon="mdi:receipt-outline" label="Orders" onClick={() => setMobileOpen(false)} />
                  <DropdownLink href="/account/wishlist" icon="mdi:heart-outline" label="Favourites" onClick={() => setMobileOpen(false)} />
                  <DropdownLink href="/account/settings" icon="mdi:cog-outline" label="Settings" onClick={() => setMobileOpen(false)} />
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      setLogoutModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 mt-1 px-4 py-2.5 text-[14px] font-body font-medium text-[#ef4444] bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-xl transition-colors"
                  >
                    <Icon icon="mdi:logout" width={18} />
                    Log Out
                  </button>
                </div>
              ) : (
                <div className="px-4 pb-4 pt-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-center gap-2 bg-[#27731e] text-white rounded-[40px] px-6 py-3.5 text-[15px] font-body"
                  >
                    Login to your account
                    <Icon icon="mdi:login" width={18} />
                  </Link>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Logout confirmation modal ── */}
      <LogoutModal
        open={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleLogoutConfirm}
      />
    </>
  );
}
