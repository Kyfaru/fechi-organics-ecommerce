"use client";

/**
 * WelcomeTransition — the full content of /admin/welcome, the page shown
 * the instant an admin's 2FA verification succeeds. It exists to give the
 * rest of the admin panel (orders, customers, dashboard, staff, security,
 * profile, activity logs, settings) time to preload in the background
 * while a short salutation animation plays, so /admin and everything
 * linked from its sidebar opens instantly right after.
 *
 * Not reachable by typing/guessing/reusing the URL: it requires a
 * one-time `?t=` token minted by POST /api/admin/welcome/start (called by
 * app/admin/login/page.tsx's finishLogin right as 2FA succeeds) and
 * consumed exactly once by POST /api/admin/welcome/verify. Any missing,
 * wrong, or already-used token just skips straight to /admin — the
 * visitor already has a real admin session by this point regardless (see
 * start/route.ts's header comment), so there's nothing to error about,
 * only the salutation itself to skip.
 *
 * Reuses this codebase's existing animation conventions: the
 * spinner-in-a-circle + CheckCircle2 swap from
 * PaymentWaitingModal/PaymentSuccessModal, and the rotating-message
 * AnimatePresence crossfade from signup-loader.tsx.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";

type Router = ReturnType<typeof useRouter>;

interface AdminMeResponse {
  fullName: string;
  backSoon: boolean;
  mustChangePassword: boolean;
}

// Randomized per mount — not a systemic color role, so plain Tailwind
// literals rather than new design-system tokens.
const NAME_COLORS = ["text-emerald-600", "text-blue-600", "text-orange-600", "text-violet-600", "text-amber-500"];

const LOADING_MESSAGES = ["Just gathering some things…", "Almost there…"];
const MESSAGE_INTERVAL_MS = 2000;
const SLOW_NETWORK_AFTER_MS = 15_000;
const HARD_TIMEOUT_MS = 30_000;
const READY_HOLD_MS = 700;

const SLOW_NETWORK_COPY =
  "Your connection seems slow right now, which is delaying your dashboard. Check your Wi-Fi or mobile data, then reconnect — you'll land on your dashboard the moment the connection steadies again.";

// Every page reachable from the sidebar right after login, and the exact
// query shape each one's own useQuery/useInfiniteQuery reads — several
// queryFns unwrap the response (.then(j => j.data)) before caching, so a
// prefetch has to replicate that exact chain or the real component just
// refetches anyway. See components/admin/Admin{Dashboard,Orders,Customers,
// Staff,Security,Profile,Activity,Settings}Client.tsx for the originals.
const PREFETCH_QUERIES: Array<{ queryKey: unknown[]; queryFn: () => Promise<unknown> }> = [
  { queryKey: ["admin-dashboard"], queryFn: () => fetch("/api/admin/dashboard").then((r) => r.json()) },
  { queryKey: ["admin-analytics", "30d", "", ""], queryFn: () => fetch("/api/admin/dashboard/analytics?range=30d").then((r) => r.json()) },
  { queryKey: ["admin-tickets-open"], queryFn: () => fetch("/api/admin/tickets?status=open").then((r) => r.json()) },
  { queryKey: ["admin-notifications-critical"], queryFn: () => fetch("/api/admin/notifications?limit=5&type=error").then((r) => r.json()) },
  // Orders' key also carries a per-admin persisted branch filter
  // (usePersistedFilter) — prefetching the unfiltered default; an admin
  // with a saved filter gets a normal (non-instant) Orders load instead.
  { queryKey: ["admin-orders", ""], queryFn: () => fetch("/api/admin/orders").then((r) => r.json()) },
  { queryKey: ["branches"], queryFn: () => fetch("/api/branches").then((r) => r.json()) },
  { queryKey: ["admin-customers"], queryFn: () => fetch("/api/admin/customers").then((r) => r.json()) },
  { queryKey: ["admin-staff"], queryFn: () => fetch("/api/admin/staff").then((r) => r.json()).then((j) => j.data) },
  { queryKey: ["admin-profile"], queryFn: () => fetch("/api/admin/profile").then((r) => r.json()).then((j) => j.data?.user ?? null) },
  { queryKey: ["admin-settings"], queryFn: () => fetch("/api/admin/settings").then((r) => r.json()).then((j) => j.data ?? {}) },
  // ["admin-me"] (Security + Staff's superadmin gate + the sidebar) isn't
  // listed here — it's seeded directly from the /api/admin/me call this
  // component already makes for the greeting, see below.
];

const PREFETCH_ROUTES = [
  "/admin",
  "/admin/orders",
  "/admin/customers",
  "/admin/staff",
  "/admin/security",
  "/admin/profile",
  "/admin/activity",
  "/admin/settings",
];

/**
 * Warms every admin surface's data + route chunk. Exported so
 * app/admin/login/page.tsx can also fire it early for a brand-new admin
 * (a real session already exists at method-choice time for that path,
 * before 2FA is even verified — see that file's handleMethodChoice) rather
 * than duplicating this list in two places. Fire-and-forget; callers don't
 * need to await it.
 */
export async function prefetchAdminSurfaces(queryClient: QueryClient, router: Router): Promise<void> {
  for (const path of PREFETCH_ROUTES) router.prefetch(path);
  await Promise.allSettled([
    ...PREFETCH_QUERIES.map(({ queryKey, queryFn }) => queryClient.prefetchQuery({ queryKey, queryFn })),
    queryClient.prefetchInfiniteQuery({
      queryKey: ["admin-activity", ""],
      queryFn: () => fetch("/api/admin/activity").then((r) => r.json()).then((j) => j.data),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage: { nextCursor: string | null } | undefined) => lastPage?.nextCursor ?? undefined,
    }),
  ]);
}

type Phase = "verifying" | "loading" | "slow" | "ready";

export default function WelcomeTransition() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const nameColor = useMemo(() => NAME_COLORS[Math.floor(Math.random() * NAME_COLORS.length)], []);

  const [phase, setPhase] = useState<Phase>("verifying");
  const [messageIndex, setMessageIndex] = useState(0);
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const doneRef = useRef(false);

  function goToDashboard() {
    if (doneRef.current) return;
    doneRef.current = true;
    router.replace("/admin");
  }

  // Rotate the loading copy every 2s until we have a result.
  useEffect(() => {
    if (phase !== "loading") return;
    const id = setInterval(() => setMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length), MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase]);

  // Slow-network / hard-timeout copy, independent of whether the work
  // below ever resolves. Only relevant once past the (near-instant) token
  // verification step.
  useEffect(() => {
    if (phase === "verifying") return;
    const slowId = setTimeout(() => setPhase((p) => (p === "loading" ? "slow" : p)), SLOW_NETWORK_AFTER_MS);
    const hardId = setTimeout(() => setTimedOut(true), HARD_TIMEOUT_MS);
    return () => {
      clearTimeout(slowId);
      clearTimeout(hardId);
    };
  }, [phase]);

  // Step 1: consume the one-time token. Anything other than a confirmed
  // valid token skips straight to /admin — see this file's header comment.
  useEffect(() => {
    let cancelled = false;
    const token = searchParams.get("t");

    (async () => {
      if (!token) {
        goToDashboard();
        return;
      }
      try {
        const res = await fetch("/api/admin/welcome/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!json?.data?.valid) {
          goToDashboard();
          return;
        }
        setPhase("loading");
      } catch {
        if (!cancelled) goToDashboard();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 2: fetch fresh admin status, warm every page's queries + route
  // chunks, hold the "ready" checkmark briefly, then navigate for real.
  useEffect(() => {
    if (phase !== "loading") return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/me", { signal: AbortSignal.timeout(HARD_TIMEOUT_MS) });
        const data = await res.json();
        if (cancelled) return;
        setMe(data);
        queryClient.setQueryData(["admin-me"], data);

        await prefetchAdminSurfaces(queryClient, router);
        if (cancelled) return;

        setPhase("ready");
        setTimeout(() => {
          if (!cancelled) goToDashboard();
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
  }, [phase]);

  if (phase === "verifying") return null;

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
