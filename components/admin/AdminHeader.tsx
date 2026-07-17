"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { Search, Bell, Settings, Sun, Moon } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/app/providers";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { GlobalSearchModal, type SearchResult } from "@/components/ui/GlobalSearchModal";

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
    router.push(result.url);
  }

  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Admin";
  const userInitial = userName.charAt(0).toUpperCase();
  const userImage = session?.user?.image ?? null;
  const imgUrl = url + "/" + userImage;

  const { data: unreadData } = useQuery({
    queryKey: ["admin-notifications-unread"],
    queryFn: () => fetch("/api/admin/notifications?unread=true").then((r) => r.json()),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const hasUnread = (unreadData?.data?.notifications?.length ?? 0) > 0;

  return (
    <header className="h-[72px] bg-white dark:bg-(--dark-surface) border-b border-(--green-200) dark:border-(--dark-border) shadow-(--e1) flex items-center px-6 gap-6 sticky top-0 z-20">
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
      <div className="relative flex-1 max-w-[480px] mx-auto">
        <div className={`flex items-center gap-2 h-10 px-4 rounded-full transition-all ${
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
            className="flex-1 bg-transparent font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) placeholder:text-(--neutral-400) outline-none"
          />
        </div>
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
      <div className="flex items-center gap-2 ml-auto">
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp"
          className="w-9 h-9 flex items-center justify-center rounded-full text-[#25d366] hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        >
          <Icon icon="mdi:whatsapp" width={20} />
        </a>

        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <Link href="/admin/notifications" className="relative w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors">
          <Bell size={18} />
          {hasUnread && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-(--danger) rounded-full" />}
        </Link>

        <Link
          href="/admin/settings"
          className="w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        >
          <Settings size={18} />
        </Link>

        <Link href="/admin/settings">
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
