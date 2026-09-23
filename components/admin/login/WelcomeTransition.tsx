"use client";

/**
 * WelcomeTransition — full-viewport screen shown the instant an admin's 2FA
 * verification succeeds, replacing the old "await /api/admin/me, then
 * redirect" blocking gap. The redirect now happens immediately in the
 * sense that the admin never sees a blank/frozen tab: this screen takes
 * over right away while the real session-status fetch and the dashboard's
 * own data queries are prefetched behind it, so /admin renders instantly
 * once we navigate there.
 *
 * Reuses this codebase's existing animation conventions rather than
 * inventing new ones: the spinner-in-a-circle + CheckCircle2 swap from
 * PaymentWaitingModal/PaymentSuccessModal, and the rotating-message
 * AnimatePresence crossfade from signup-loader.tsx.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";

export interface AdminMeResponse {
  twoFactorEnabled: boolean;
  twoFaEmail: boolean;
  twoFaPhone: boolean;
  userId: string;
  email: string;
  phone: string | null;
  fullName: string;
  backSoon: boolean;
  mustChangePassword: boolean;
}

interface WelcomeTransitionProps {
  onDone: (me: AdminMeResponse) => void;
}

// Randomized per mount — not a systemic color role, so plain Tailwind
// literals rather than new design-system tokens (see plan notes).
const NAME_COLORS = ["text-emerald-600", "text-blue-600", "text-orange-600", "text-violet-600", "text-amber-500"];

const LOADING_MESSAGES = ["Just gathering some things…", "Almost there…"];
const MESSAGE_INTERVAL_MS = 2000;
const SLOW_NETWORK_AFTER_MS = 15_000;
const HARD_TIMEOUT_MS = 30_000;
const READY_HOLD_MS = 700;

const SLOW_NETWORK_COPY =
  "Your connection seems slow right now, which is delaying your dashboard. Check your Wi-Fi or mobile data, then reconnect — you'll land on your dashboard the moment the connection steadies again.";

// The dashboard's own query keys/URLs (components/admin/AdminDashboardClient.tsx)
// — warmed here so /admin renders with no loading flash once we navigate.
const DASHBOARD_PREFETCH: Array<{ queryKey: unknown[]; url: string }> = [
  { queryKey: ["admin-dashboard"], url: "/api/admin/dashboard" },
  { queryKey: ["admin-analytics", "30d", "", ""], url: "/api/admin/dashboard/analytics?range=30d" },
  { queryKey: ["admin-tickets-open"], url: "/api/admin/tickets?status=open" },
  { queryKey: ["admin-notifications-critical"], url: "/api/admin/notifications?limit=5&type=error" },
];

type Phase = "loading" | "slow" | "ready";

export default function WelcomeTransition({ onDone }: WelcomeTransitionProps) {
  const queryClient = useQueryClient();
  const nameColor = useMemo(() => NAME_COLORS[Math.floor(Math.random() * NAME_COLORS.length)], []);

  const [phase, setPhase] = useState<Phase>("loading");
  const [messageIndex, setMessageIndex] = useState(0);
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const doneRef = useRef(false);

  // Rotate the loading copy every 2s until we have a result.
  useEffect(() => {
    if (phase !== "loading") return;
    const id = setInterval(() => setMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length), MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase]);

  // Slow-network / hard-timeout copy, independent of whether the fetch below
  // ever resolves.
  useEffect(() => {
    const slowId = setTimeout(() => setPhase((p) => (p === "loading" ? "slow" : p)), SLOW_NETWORK_AFTER_MS);
    const hardId = setTimeout(() => setTimedOut(true), HARD_TIMEOUT_MS);
    return () => {
      clearTimeout(slowId);
      clearTimeout(hardId);
    };
  }, []);

  // The actual work: fetch fresh admin status, then warm the dashboard's
  // queries, then hold the "ready" checkmark just long enough to register
  // before handing control back to the login page.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/me", { signal: AbortSignal.timeout(HARD_TIMEOUT_MS) });
        const data: AdminMeResponse = await res.json();
        if (cancelled) return;
        setMe(data);

        await Promise.allSettled(
          DASHBOARD_PREFETCH.map(({ queryKey, url }) =>
            queryClient.prefetchQuery({ queryKey, queryFn: () => fetch(url).then((r) => r.json()) }),
          ),
        );
        if (cancelled) return;

        setPhase("ready");
        setTimeout(() => {
          if (!cancelled && !doneRef.current) {
            doneRef.current = true;
            onDone(data);
          }
        }, READY_HOLD_MS);
      } catch {
        // AbortSignal fired or the network truly died — the hard-timeout
        // effect above already flips timedOut, offering a manual reload.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = me?.backSoon ? "Back so soon," : "Welcome back,";
  const statusText =
    phase === "ready" ? "It's ready" : phase === "slow" ? SLOW_NETWORK_COPY : LOADING_MESSAGES[messageIndex];

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      <h1 className="font-syne text-[32px] sm:text-[42px] font-bold text-black text-center">
        {greeting}{" "}
        {me && (
          <span className={`italic font-bold ${nameColor}`}>{me.fullName}</span>
        )}
      </h1>

      <div className="mt-12 flex flex-col items-center gap-3">
        {phase === "ready" ? (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-14 h-14 rounded-full bg-(--green-50) flex items-center justify-center"
          >
            <CheckCircle2 size={28} className="text-(--green-800)" />
          </motion.div>
        ) : (
          <div className="w-14 h-14 rounded-full bg-(--green-50) flex items-center justify-center">
            <Loader2 size={28} className="text-(--green-800) animate-spin" />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.p
            key={statusText}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={`font-dm text-[14px] text-(--neutral-500) text-center ${phase === "slow" ? "max-w-sm" : ""}`}
          >
            {statusText}
          </motion.p>
        </AnimatePresence>

        {timedOut && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 h-9 px-4 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[13px] font-medium text-white transition-colors"
          >
            Reload
          </button>
        )}
      </div>
    </motion.div>
  );
}
