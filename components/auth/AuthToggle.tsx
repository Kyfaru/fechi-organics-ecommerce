"use client";

import Link from "next/link";

type AuthMode = "login" | "signup";

interface AuthToggleProps {
  active: AuthMode;
}

/**
 * Pill toggle — "LOG IN" | "SIGN UP".
 *
 * The active tab has a white pill background with a subtle shadow.
 * The inactive tab is transparent text only.
 * Clicking the inactive tab navigates to the corresponding page.
 */
export default function AuthToggle({ active }: AuthToggleProps) {
  const pillClass = (mode: AuthMode) =>
    [
      "px-6 sm:px-16 py-2 rounded-full text-sm font-semibold tracking-widest transition-all duration-200",
      active === mode
        ? "bg-white dark:bg-gray-700 text-[#1a1c1c] dark:text-white shadow-sm font-bold"
        : "text-[#40493c] dark:text-gray-400 hover:text-[#1a1c1c] dark:hover:text-white font-normal",
    ].join(" ");

  return (
    <div className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 p-1 gap-1">
      <Link href="/login" className={pillClass("login")} aria-current={active === "login" ? "page" : undefined}>
        LOG IN
      </Link>
      <Link href="/signup" className={pillClass("signup")} aria-current={active === "signup" ? "page" : undefined}>
        SIGN UP
      </Link>
    </div>
  );
}
