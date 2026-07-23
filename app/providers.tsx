"use client";

import { QueryClient, useQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { CurrencyCode, FxRates } from "@/lib/currency";
import { CURRENCIES, formatPrice } from "@/lib/currency";
import { PostHogProvider } from "@/components/PostHogProvider";
import { PrelineInit } from "@/components/admin/PrelineInit";
import { authClient, useSession } from "@/lib/auth-client";

// ── TanStack Query ─────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 24 * 60 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

const CACHE_STORAGE_KEY = "fechi-cache";

/** Wipes the persisted query cache — call this from every logout handler. */
export function clearPersistedQueryCache() {
  browserQueryClient?.clear();
  if (typeof window !== "undefined") localStorage.removeItem(CACHE_STORAGE_KEY);
}

// ── Theme context ───────────────────────────────────────────────────────────

type ThemeCtx = { theme: "light" | "dark"; toggleTheme: () => void };

const ThemeContext = createContext<ThemeCtx>({
  theme: "light",
  toggleTheme: () => {},
});

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Light by default; only dark if the user explicitly toggled it before.
    const stored = localStorage.getItem("fechi-theme") as "light" | "dark" | null;
    const initial = stored ?? "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("fechi-theme", next);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// ── Currency context ────────────────────────────────────────────────────────

type CurrencyCtx = {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  rates: Record<CurrencyCode, number>;
  format: (kesCents: number) => string;
  currencies: typeof CURRENCIES;
};

const DEFAULT_RATES: Record<CurrencyCode, number> = {
  KSH: 1, USD: 0.0077, GBP: 0.0062, EUR: 0.0071,
  ZAR: 0.143, NGN: 12.5, CNY: 0.056,
};

const CurrencyContext = createContext<CurrencyCtx>({
  currency: "KSH",
  setCurrency: () => {},
  rates: DEFAULT_RATES,
  format: (c) => `KSh${(c / 100).toFixed(0)}`,
  currencies: CURRENCIES,
});

function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("KSH");

  useEffect(() => {
    // Read persisted selection from cookie / localStorage
    const stored =
      document.cookie.match(/fechi_currency=([^;]+)/)?.[1] ??
      localStorage.getItem("fechi_currency");
    if (stored && CURRENCIES.some((c) => c.code === stored)) {
      setCurrencyState(stored as CurrencyCode);
    }
  }, []);

  const { data: ratesData } = useQuery<FxRates>({
    queryKey: ["currencyRates"],
    queryFn: () => fetch("/api/currency/rates").then((r) => r.json()).then((d) => d.data),
    staleTime: 6 * 60 * 60 * 1000,
    placeholderData: { base: "KES", rates: DEFAULT_RATES, fetchedAt: "", source: "fallback" },
    // Do not run during server-side prerender — the query client is hydrated on the client
    enabled: typeof window !== "undefined",
  });

  const rates = (ratesData?.rates ?? DEFAULT_RATES) as Record<CurrencyCode, number>;

  function setCurrency(c: CurrencyCode) {
    setCurrencyState(c);
    document.cookie = `fechi_currency=${c};path=/;max-age=${365 * 24 * 3600};SameSite=Lax`;
    localStorage.setItem("fechi_currency", c);
  }

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        rates,
        format: (kesCents) => formatPrice(kesCents, rates[currency] ?? 1, currency),
        currencies: CURRENCIES,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

// ── Portal session guard ────────────────────────────────────────────────────

/**
 * Signs out an admin-role session found anywhere outside /admin/* — an admin
 * session must never look "logged in" on the customer storefront. Deliberately
 * skips /admin/* (AdminGuard already redirects a wrong-role session to /403
 * there; forcibly destroying a client's legitimate session over a mistyped
 * admin URL would be needlessly punitive).
 *
 * This is what catches the one gap the /login and /admin/login pages' own
 * precheck (lib/portal-check.ts) can't cover: signIn.social() does a full
 * OAuth redirect with no email step first, so an existing admin who
 * authenticates via a social button on /login can't be intercepted before a
 * session exists — this guard catches it on the very next render instead.
 *
 * Uses the shared useSession() hook (not a fresh authClient.getSession()
 * call) deliberately — Better Auth's client caches that hook's result across
 * every consumer in the app, so this adds no extra request beyond what
 * Navbar/PostHogProvider/etc. already trigger. An earlier version called
 * getSession() imperatively on every pathname change, which fired a fresh
 * network request per route and tripped Better Auth's global auth-route rate
 * limit (lib/auth.ts, max 10/60s) for anyone navigating quickly — including
 * admins browsing the storefront.
 */
function PortalSessionGuard() {
  const pathname = usePathname();
  const { data, isPending } = useSession();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    if (isPending || !data?.session) return;
    if ((data.user as { role?: string } | undefined)?.role === "admin") {
      authClient.signOut();
    }
  }, [pathname, data, isPending]);

  return null;
}

// ── Root providers wrapper ──────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const qc = getQueryClient();
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: CACHE_STORAGE_KEY,
      throttleTime: 2000,
    }),
  );
  return (
    <PostHogProvider>
      <PrelineInit />
      <PortalSessionGuard />
      <PersistQueryClientProvider
        client={qc}
        persistOptions={{ persister, maxAge: 24 * 60 * 60_000 }}
      >
        <ThemeProvider>
          <CurrencyProvider>{children}</CurrencyProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </PostHogProvider>
  );
}
