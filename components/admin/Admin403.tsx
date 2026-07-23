"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * Rendered in place of a protected page's content when the signed-in admin's
 * role can't access it. The admin shell (sidebar/header/footer) stays
 * mounted — this only replaces the content region — since navigating away
 * to a standalone /403 route would lose that context for no reason.
 */
export function Admin403() {
  useEffect(() => {
    toast.error("Access denied", { message: "You don't have permission to view this page." });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-(--danger-bg) flex items-center justify-center mb-4">
        <ShieldAlert size={26} className="text-(--danger)" />
      </div>
      <h1 className="font-syne text-[20px] font-bold text-(--neutral-900) dark:text-(--dark-text) mb-2">
        Access Restricted
      </h1>
      <p className="font-dm text-[14px] text-(--neutral-500) dark:text-(--dark-muted) max-w-md mb-6">
        You don&apos;t have permission to view this page. Contact an administrator if you believe this is a mistake.
      </p>
      <Link
        href="/admin"
        className="h-10 px-5 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors inline-flex items-center"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
