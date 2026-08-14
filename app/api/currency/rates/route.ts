import { getFxRates } from "@/lib/currency";
import { ok, Err } from "@/lib/api";
import { CURRENCIES } from "@/lib/currency";
import { connection } from "next/server";
import { reportError } from "@/lib/observability";

export async function GET() {
  await connection();
  try {
    const rates = await getFxRates();
    return ok({
      ...rates,
      symbols: Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol])),
    });
  } catch (e) {
    console.error("[currency/rates] GET error", e);
    reportError(e, { route: "GET /api/currency/rates" });
    return Err.internal();
  }
}
