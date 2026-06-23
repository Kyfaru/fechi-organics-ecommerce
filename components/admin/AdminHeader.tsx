"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Bell, Settings, Sun, Moon } from "lucide-react";
import { useSession } from "@/lib/auth-client";

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

export function AdminHeader() {
  const [dark, setDark] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Admin";
  const userInitial = userName.charAt(0).toUpperCase();
  const userImage = session?.user?.image ?? null;

  useEffect(() => {
    const stored = localStorage.getItem("adminTheme");
    if (stored === "dark") {
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("adminTheme", next ? "dark" : "light");
  }

  return (
    <header className="h-[72px] bg-white dark:bg-(--dark-surface) border-b border-(--green-200) dark:border-(--dark-border) shadow-(--e1) flex items-center px-6 gap-6 sticky top-0 z-20">
      {/* Greeting */}
      <div className="hidden lg:block min-w-[220px]">
        <div className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text) leading-tight">
          {getGreeting()}, {userName.split(" ")[0]}
        </div>
        <div className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted)">
          {formatDate()}
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-[480px] mx-auto">
        <div className={`flex items-center gap-2 h-10 px-4 rounded-full transition-all ${
          searchFocused
            ? "bg-white dark:bg-(--dark-bg) border border-(--green-500) shadow-(--e2)"
            : "bg-(--neutral-50) dark:bg-(--dark-bg) border border-transparent"
        }`}>
          <Search size={16} className="text-(--neutral-400) shrink-0" />
          <input
            type="text"
            placeholder="Search products, orders, customers…"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) placeholder:text-(--neutral-400) outline-none"
          />
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button className="relative w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-(--danger) rounded-full" />
        </button>

        <Link
          href="/admin/settings"
          className="w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        >
          <Settings size={18} />
        </Link>

        <Link href="/admin/settings">
          <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-(--green-500) dark:hover:ring-(--dark-accent) transition cursor-pointer">
            {userImage ? (
              <Image src={userImage} alt={userName} width={36} height={36} className="object-cover w-full h-full" />
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
