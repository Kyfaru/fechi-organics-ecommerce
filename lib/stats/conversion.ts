/**
 * Conversion rate by social channel — paid orders ÷ carts, grouped by the
 * last-touch utmSource stamped via lib/attribution.ts. Powers the Reports
 * page's Facebook/Instagram/Google/TikTok section.
 */
import { db } from "@/lib/db";
import { bucketKey, generateBuckets, type Granularity } from "@/lib/date-buckets";
import { resolveWindow, granularityFor, type StatRange } from "@/lib/stats/channel-breakdown";
import { TRACKED_UTM_SOURCES, type UtmSource } from "@/lib/attribution";

export interface ConversionResult {
  source: UtmSource;
  orders: number;
  revenue: number;
  carts: number;
  conversionRate: number;
  series: { date: string; value: number }[];
}

export function getConversionSummary(range: StatRange): Promise<ConversionResult[]> {
  const now = new Date();
  const { gte } = resolveWindow(range, now);
  return getConversionSummaryForWindow(gte, now, granularityFor(range));
}

/** Same aggregation over an arbitrary [gte, lte] window — used by the PDF export, which isn't tied to a StatRange preset. */
export async function getConversionSummaryForWindow(gte: Date | null, lte: Date, granularity: Granularity): Promise<ConversionResult[]> {
  const dateFilter = gte ? { gte, lte } : { lte };
  const buckets = generateBuckets(gte, lte, granularity);

  const [orders, cartGroups] = await Promise.all([
    db.order.findMany({
      where: { paymentStatus: "PAID", createdAt: dateFilter, utmSource: { not: null } },
      select: { createdAt: true, totalKes: true, utmSource: true },
    }),
    db.cart.groupBy({
      by: ["utmSource"],
      _count: { _all: true },
      where: { createdAt: dateFilter, utmSource: { not: null } },
    }),
  ]);

  return TRACKED_UTM_SOURCES.map((source) => {
    const sourceOrders = orders.filter((o) => o.utmSource === source);
    const carts = cartGroups.find((c) => c.utmSource === source)?._count._all ?? 0;

    const bucketMap: Record<string, number> = {};
    for (const o of sourceOrders) {
      const key = bucketKey(o.createdAt, granularity);
      bucketMap[key] = (bucketMap[key] ?? 0) + 1;
    }
    const series = buckets.map((date) => ({ date, value: bucketMap[date] ?? 0 }));
    const revenue = sourceOrders.reduce((s, o) => s + o.totalKes, 0);

    return {
      source,
      orders: sourceOrders.length,
      revenue,
      carts,
      conversionRate: carts > 0 ? Math.round((sourceOrders.length / carts) * 1000) / 10 : 0,
      series,
    };
  });
}
