import { getFxRates } from "@/lib/currency";
import { ok, Err } from "@/lib/api";
import { CURRENCIES } from "@/lib/currency";

export async function GET() {
  try {
    const rates = await getFxRates();
    return ok({
      ...rates,
      symbols: Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol])),
    });
  } catch (e) {
    console.error("[currency/rates] GET error", e);
    return Err.internal();
  }
}
