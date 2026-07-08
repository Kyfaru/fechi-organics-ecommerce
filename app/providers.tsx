"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import type { CurrencyCode, FxRates } from "@/lib/currency";
import { CURRENCIES, formatPrice } from "@/lib/currency";
import { PostHogProvider } from "@/components/PostHogProvider";
import { PrelineInit } from "@/components/admin/PrelineInit";

// ── TanStack Query ─────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
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

// ── Theme context ───────────────────────────────────────────────────────────

type ThemeCtx = { theme: "light" | "dark"; toggleTheme: () => void };

const ThemeContext = createContext<ThemeCtx>({
  theme: "light",
  toggleTheme: () => {},
});

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Prefer stored preference; fall back to OS preference
    const stored = localStorage.getItem("fechi-theme") as "light" | "dark" | null;
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const initial = stored ?? preferred;
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

// ── Root providers wrapper ──────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const qc = getQueryClient();
  return (
    <PostHogProvider>
      <PrelineInit />
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <CurrencyProvider>{children}</CurrencyProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </PostHogProvider>
  );
}
