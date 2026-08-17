/**
 * Revenue/order series broken down by sales channel, merging online `order`
 * (filtered by deliveryType) with the separate `inStoreOrder` model — the
 * same merge pattern used in app/api/admin/dashboard/route.ts, generalized
 * so Dashboard, Finance, and Reports stat cards share one implementation.
 */
import { db } from "@/lib/db";
import { getPeriodChange, type PeriodChange } from "@/lib/stats";
import { bucketKey, generateBuckets, type Granularity } from "@/lib/date-buckets";

export type ChannelScope = "total" | "website" | "home-delivery" | "store-pickup" | "instore";
export type StatRange = "today" | "3d" | "7d" | "30d" | "60d" | "90d" | "all";

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface ChannelSeriesResult {
  value: number;
  change: PeriodChange;
  series: SeriesPoint[];
}

const RANGE_DAYS: Partial<Record<StatRange, number>> = {
  "3d": 3,
  "7d": 7,
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

export function granularityFor(range: StatRange): Granularity {
  if (range === "today") return "hourly";
  if (range === "all") return "monthly";
  return "daily";
}

/** [currentStart, now] plus the equal-length window immediately before it. */
export function resolveWindow(range: StatRange, now = new Date()) {
  if (range === "all") {
    return { gte: null as Date | null, prevGte: null as Date | null, prevLte: null as Date | null };
  }
  if (range === "today") {
    const gte = new Date(now);
    gte.setHours(0, 0, 0, 0);
    const prevGte = new Date(gte);
    prevGte.setDate(prevGte.getDate() - 1);
    return { gte, prevGte, prevLte: gte };
  }
  const days = RANGE_DAYS[range]!;
  const gte = new Date(now);
  gte.setDate(gte.getDate() - days);
  gte.setHours(0, 0, 0, 0);
  const prevGte = new Date(gte);
  prevGte.setDate(prevGte.getDate() - days);
  return { gte, prevGte, prevLte: gte };
}

async function fetchRows(scope: ChannelScope, gte: Date | null, lte: Date) {
  const dateFilter = gte ? { gte, lte } : { lte };
  const wantsOnline = scope !== "instore";
  const wantsInStore = scope === "total" || scope === "instore";
  const deliveryType = scope === "home-delivery" ? "DELIVERY" : scope === "store-pickup" ? "PICKUP" : undefined;

  const [onlineRows, inStoreRows] = await Promise.all([
    wantsOnline
      ? db.order.findMany({
          where: {
            paymentStatus: "PAID",
            createdAt: dateFilter,
            ...(deliveryType ? { deliveryType } : {}),
          },
          select: { createdAt: true, totalKes: true, deliveryKes: true },
        })
      : Promise.resolve([]),
    wantsInStore
      ? db.inStoreOrder.findMany({
          where: { paymentStatus: "PAID", createdAt: dateFilter },
          select: { createdAt: true, totalKes: true, deliveryKes: true },
        })
      : Promise.resolve([]),
  ]);

  return [...onlineRows, ...inStoreRows];
}

async function getChannelSeries(opts: {
  scope: ChannelScope;
  range: StatRange;
  metric: "revenue" | "count";
}): Promise<ChannelSeriesResult> {
  const { scope, range, metric } = opts;
  const now = new Date();
  const granularity = granularityFor(range);
  const { gte, prevGte, prevLte } = resolveWindow(range, now);

  const [currentRows, previousRows] = await Promise.all([
    fetchRows(scope, gte, now),
    prevGte ? fetchRows(scope, prevGte, prevLte!) : Promise.resolve([]),
  ]);

  // Revenue excludes delivery fee (both channels) — it's tracked separately
  // (see getDeliveryFeesSeries) rather than counted as store revenue.
  const bucketMap: Record<string, number> = {};
  for (const row of currentRows) {
    const key = bucketKey(row.createdAt, granularity);
    bucketMap[key] = (bucketMap[key] ?? 0) + (metric === "revenue" ? row.totalKes - row.deliveryKes : 1);
  }

  const buckets = generateBuckets(gte, now, granularity);
  const series = buckets.map((date) => ({ date, value: bucketMap[date] ?? 0 }));

  const value = metric === "revenue"
    ? currentRows.reduce((sum, r) => sum + r.totalKes - r.deliveryKes, 0)
    : currentRows.length;
  const previousValue = metric === "revenue"
    ? previousRows.reduce((sum, r) => sum + r.totalKes - r.deliveryKes, 0)
    : previousRows.length;

  return { value, change: getPeriodChange(value, previousValue), series };
}

export function getRevenueSeries(opts: { scope: ChannelScope; range: StatRange }): Promise<ChannelSeriesResult> {
  return getChannelSeries({ ...opts, metric: "revenue" });
}

export function getOrderSeries(opts: { scope: ChannelScope; range: StatRange }): Promise<ChannelSeriesResult> {
  return getChannelSeries({ ...opts, metric: "count" });
}

/** Total delivery fees collected — in-store orders only, no channel scope (mirrors getRevenueSeries's shape). */
export async function getDeliveryFeesSeries(opts: { range: StatRange }): Promise<ChannelSeriesResult> {
  const now = new Date();
  const granularity = granularityFor(opts.range);
  const { gte, prevGte, prevLte } = resolveWindow(opts.range, now);

  async function fetchDeliveryRows(from: Date | null, to: Date) {
    const dateFilter = from ? { gte: from, lte: to } : { lte: to };
    return db.inStoreOrder.findMany({
      where: { paymentStatus: "PAID", createdAt: dateFilter },
      select: { createdAt: true, deliveryKes: true },
    });
  }

  const [currentRows, previousRows] = await Promise.all([
    fetchDeliveryRows(gte, now),
    prevGte ? fetchDeliveryRows(prevGte, prevLte!) : Promise.resolve([]),
  ]);

  const bucketMap: Record<string, number> = {};
  for (const row of currentRows) {
    const key = bucketKey(row.createdAt, granularity);
    bucketMap[key] = (bucketMap[key] ?? 0) + row.deliveryKes;
  }
  const buckets = generateBuckets(gte, now, granularity);
  const series = buckets.map((date) => ({ date, value: bucketMap[date] ?? 0 }));

  const value = currentRows.reduce((sum, r) => sum + r.deliveryKes, 0);
  const previousValue = previousRows.reduce((sum, r) => sum + r.deliveryKes, 0);

  return { value, change: getPeriodChange(value, previousValue), series };
}

async function fetchTransactionRows(gte: Date | null, lte: Date) {
  const dateFilter = gte ? { gte, lte } : { lte };
  const [onlineTx, inStoreTx] = await Promise.all([
    db.transaction.findMany({ where: { createdAt: dateFilter }, select: { createdAt: true } }),
    db.inStoreTransaction.findMany({ where: { createdAt: dateFilter }, select: { createdAt: true } }),
  ]);
  return [...onlineTx, ...inStoreTx];
}

/** Payment attempts (online `transaction` + `inStoreTransaction`) — not scoped by channel. */
export async function getTransactionSeries(opts: { range: StatRange }): Promise<ChannelSeriesResult> {
  const now = new Date();
  const granularity = granularityFor(opts.range);
  const { gte, prevGte, prevLte } = resolveWindow(opts.range, now);

  const [currentRows, previousRows] = await Promise.all([
    fetchTransactionRows(gte, now),
    prevGte ? fetchTransactionRows(prevGte, prevLte!) : Promise.resolve([]),
  ]);

  const bucketMap: Record<string, number> = {};
  for (const row of currentRows) {
    const key = bucketKey(row.createdAt, granularity);
    bucketMap[key] = (bucketMap[key] ?? 0) + 1;
  }
  const buckets = generateBuckets(gte, now, granularity);
  const series = buckets.map((date) => ({ date, value: bucketMap[date] ?? 0 }));

  return { value: currentRows.length, change: getPeriodChange(currentRows.length, previousRows.length), series };
}

/** Expected-transactions baseline (1000/month), prorated to a range's day span. `null` for "all" (no natural span). */
export function expectedTransactionsFor(range: StatRange): number | null {
  if (range === "all") return null;
  const days = range === "today" ? 1 : RANGE_DAYS[range]!;
  return Math.round((1000 / 30) * days);
}

export const VALID_SCOPES: ChannelScope[] = ["total", "website", "home-delivery", "store-pickup", "instore"];
export const VALID_RANGES: StatRange[] = ["today", "3d", "7d", "30d", "60d", "90d", "all"];
