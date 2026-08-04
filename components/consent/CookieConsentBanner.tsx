"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { Spinner } from "@/components/ui/spinner";

interface CookieConsentBannerProps {
  /** Server-derived initial state (real cookie or dev bypass) — avoids a
   * flash of the banner on load. */
  initiallyConsented: boolean;
}

export function CookieConsentBanner({ initiallyConsented }: CookieConsentBannerProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(!initiallyConsented);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!visible) return null;

  async function handleAccept() {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/cookie-consent", { method: "POST" });
      if (res.ok) {
        setVisible(false);
        // Re-run server components (ConsentGate) so Google Analytics mounts
        // in this same page view, no full reload needed.
        router.refresh();
      }
    } catch {
      // Non-fatal — banner stays up, user can retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReject() {
    // Client-side dismiss only — nothing persisted, so the banner reappears
    // on the next page (its visibility is re-derived from the server cookie
    // on every navigation).
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none sm:items-end sm:justify-center sm:p-5">
      <div className="pointer-events-auto w-full max-w-sm sm:max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 sm:items-center">
          <div
            className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(254,199,0,0.15)" }}
          >
            <Icon icon="mdi:cookie" width={26} height={26} color="#fec700" />
          </div>
          <p className="text-sm text-[#40493c] dark:text-gray-300 leading-relaxed">
            We use cookies to ensure the best possible experience. By using our site you agree
            with our{" "}
            <Link
              href="/privacy-policy"
              className="font-semibold underline hover:text-[#27731e]"
              style={{ color: "#045a03" }}
            >
              Cookie Policy
            </Link>
            .
          </p>
        </div>

        <div className="flex gap-3 sm:shrink-0">
          <button
            onClick={handleReject}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-full font-bold text-sm border-2 border-[#27731e] text-[#27731e] bg-transparent hover:bg-[#27731e]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reject
          </button>
          <button
            onClick={handleAccept}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-full font-bold text-sm text-white bg-[#27731e] hover:bg-[#1f5f18] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting ? <Spinner size={14} invert /> : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}
