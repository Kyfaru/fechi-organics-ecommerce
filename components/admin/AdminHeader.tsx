"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { Search, Settings, Sun, Moon, Menu, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/app/providers";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { GlobalSearchModal, type SearchResult } from "@/components/ui/GlobalSearchModal";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { ExportHeaderIcon } from "@/components/admin/exports/ExportHeaderIcon";

const WHATSAPP_URL = "https://wa.me/254768151505";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
const url = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
export function AdminHeader() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const router = useRouter();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSearch, setMobileSearch] = useState(false);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const { data: searchData, isFetching: searchLoading } = useQuery<{ ok: boolean; data: { results: SearchResult[] } }>({
    queryKey: ["admin-global-search", debouncedSearch],
    queryFn: () => fetch(`/api/admin/search?q=${encodeURIComponent(debouncedSearch)}`).then((r) => r.json()),
    enabled: debouncedSearch.trim().length >= 2,
  });
  const searchResults = searchData?.data?.results ?? [];

  function handleSelectResult(result: SearchResult) {
    setSearchQuery("");
    setSearchFocused(false);
    setMobileSearch(false);
    router.push(result.url);
  }

  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Admin";
  const userInitial = userName.charAt(0).toUpperCase();
  const userImage = session?.user?.image ?? null;
  const imgUrl = url + "/" + userImage;

  return (
    <header className="h-14 sm:h-[72px] bg-white dark:bg-(--dark-surface) border-b border-(--green-200) dark:border-(--dark-border) shadow-(--e1) flex items-center px-3 sm:px-6 gap-2 sm:gap-6 sticky top-0 z-20">
      {/* Mobile nav trigger */}
      <button
        onClick={() => window.dispatchEvent(new Event("admin:open-nav"))}
        aria-label="Open menu"
        className="md:hidden w-10 h-10 -ml-1 flex items-center justify-center rounded-full text-(--neutral-700) dark:text-(--dark-text) active:bg-(--neutral-100) dark:active:bg-(--dark-border)"
      >
        <Menu size={22} />
      </button>
      <span className="sm:hidden font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text) truncate">Fechi Admin</span>

      {/* Greeting */}
      <div className="hidden lg:block min-w-[220px]">
        <div className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text) leading-tight" suppressHydrationWarning>
          {getGreeting()}, {userName.split(" ")[0]}
        </div>
        <div className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted)" suppressHydrationWarning>
          {formatDate()}
        </div>
      </div>

      {/* Search */}
      <div
        className={`relative flex-1 max-w-[480px] mx-auto ${
          mobileSearch
            ? "max-sm:absolute max-sm:inset-0 max-sm:z-10 max-sm:flex max-sm:items-center max-sm:gap-1 max-sm:px-3 max-sm:max-w-none max-sm:bg-white dark:max-sm:bg-(--dark-surface)"
            : "max-sm:hidden"
        }`}
      >
        <div className={`flex-1 flex items-center gap-2 h-10 px-4 rounded-full transition-all ${
          searchFocused
            ? "bg-white dark:bg-(--dark-bg) border border-(--green-500) shadow-(--e2)"
            : "bg-(--neutral-50) dark:bg-(--dark-bg) border border-transparent"
        }`}>
          <Search size={16} className="text-(--neutral-400) shrink-0" />
          <input
            type="text"
            placeholder="Search products, orders, customers…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
            autoFocus={mobileSearch}
            className="flex-1 min-w-0 bg-transparent font-dm text-[16px] sm:text-[14px] text-(--neutral-900) dark:text-(--dark-text) placeholder:text-(--neutral-400) outline-none"
          />
        </div>
        {mobileSearch && (
          <button
            onClick={() => { setMobileSearch(false); setSearchQuery(""); }}
            aria-label="Close search"
            className="sm:hidden w-10 h-10 flex items-center justify-center rounded-full text-(--neutral-500)"
          >
            <X size={20} />
          </button>
        )}
        {searchFocused && (
          <GlobalSearchModal
            query={searchQuery}
            results={searchResults}
            loading={searchLoading}
            onSelect={handleSelectResult}
          />
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 sm:gap-2 ml-auto">
        <button
          onClick={() => setMobileSearch(true)}
          aria-label="Search"
          className="sm:hidden w-10 h-10 flex items-center justify-center rounded-full text-(--neutral-500) active:bg-(--neutral-100) dark:active:bg-(--dark-border)"
        >
          <Search size={20} />
        </button>

        <div className="max-sm:hidden"><ExportHeaderIcon /></div>

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp"
          className="max-sm:hidden w-9 h-9 flex items-center justify-center rounded-full text-[#25d366] hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        >
          <Icon icon="mdi:whatsapp" width={20} />
        </a>

        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <NotificationBell />

        <Link
          href="/admin/settings"
          className="max-sm:hidden w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        >
          <Settings size={18} />
        </Link>

        <Link href="/admin/profile">
          <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-(--green-500) dark:hover:ring-(--dark-accent) transition cursor-pointer">
            {userImage ? (
              <Image src={imgUrl} alt={userName} width={36} height={36} className="object-cover w-full h-full" />
            ) : (
              <div className="w-full h-full bg-(--green-800) text-white font-dm text-[14px] font-semibold flex items-center justify-center select-none">
                {userInitial}
              </div>
            )}
          </div>
        </Link>
      </div>
    </header>
  );
}
