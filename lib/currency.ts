import { getRedis } from "./redis";

export const CURRENCIES = [
  { code: "KSH", symbol: "KSh", label: "Kenyan Shilling" },
  { code: "USD", symbol: "$",   label: "US Dollar" },
  { code: "GBP", symbol: "£",   label: "British Pound" },
  { code: "EUR", symbol: "€",   label: "Euro" },
  { code: "ZAR", symbol: "R",   label: "South African Rand" },
  { code: "NGN", symbol: "₦",   label: "Nigerian Naira" },
  { code: "CNY", symbol: "¥",   label: "Chinese Yuan" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

const REDIS_KEY = "fechi:fx:rates:KES";
const REDIS_STALE_KEY = "fechi:fx:rates:KES:stale";
const TTL = 21600; // 6 hours

/** Hardcoded fallback rates (approximate) relative to KES */
const FX_FALLBACK: Record<CurrencyCode, number> = {
  KSH: 1,
  USD: 0.0077,
  GBP: 0.0062,
  EUR: 0.0071,
  ZAR: 0.143,
  NGN: 12.5,
  CNY: 0.056,
};

export type FxRates = {
  base: "KES";
  rates: Record<CurrencyCode, number>;
  fetchedAt: string;
  source: "live" | "stale" | "fallback";
};

/** Fetch and cache FX rates. Used by GET /api/currency/rates and QStash cron. */
export async function getFxRates(): Promise<FxRates> {
  const redis = getRedis();

  // 1. Try cache
  const cached = await redis.get(REDIS_KEY);
  if (cached) return cached as FxRates;

  // 2. Fetch from provider
  try {
    const res = await fetch(
      "https://open.er-api.com/v6/latest/KES",
      { next: { revalidate: 0 } }
    );
    if (res.ok) {
      const data = await res.json();
      const rates: Record<CurrencyCode, number> = {
        KSH: 1,
        USD: data.rates?.USD ?? FX_FALLBACK.USD,
        GBP: data.rates?.GBP ?? FX_FALLBACK.GBP,
        EUR: data.rates?.EUR ?? FX_FALLBACK.EUR,
        ZAR: data.rates?.ZAR ?? FX_FALLBACK.ZAR,
        NGN: data.rates?.NGN ?? FX_FALLBACK.NGN,
        CNY: data.rates?.CNY ?? FX_FALLBACK.CNY,
      };
      const result: FxRates = { base: "KES", rates, fetchedAt: new Date().toISOString(), source: "live" };
      await redis.set(REDIS_KEY, result, { ex: TTL });
      await redis.set(REDIS_STALE_KEY, result);
      return result;
    }
  } catch {
    // fall through
  }

  // 3. Try stale copy
  const stale = await redis.get(REDIS_STALE_KEY);
  if (stale) return { ...(stale as FxRates), source: "stale" };

  // 4. Hardcoded fallback
  return { base: "KES", rates: FX_FALLBACK, fetchedAt: new Date().toISOString(), source: "fallback" };
}

/** Convert a KES-cent price to display string in the selected currency. */
export function formatPrice(kesCents: number, rate: number, currencyCode: CurrencyCode): string {
  const symbol = CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? "KSh";
  const amount = (kesCents / 100) * rate;
  // For currencies where sub-unit display doesn't apply (KSH, NGN, ZAR) show no decimals
  const decimals = ["KSH"].includes(currencyCode) ? 0 : 2;
  return `${symbol}${amount.toLocaleString("en-KE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
