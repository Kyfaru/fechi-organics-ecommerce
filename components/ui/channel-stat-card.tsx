"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { MetricChart, formatCompact, ACCENTS, type MetricAccent, type ChartView } from "./metric-chart";
import { ViewToggle } from "./metric-controls";
import { TimeRangeTabs, TIME_RANGE_PRESETS, type TimeRangeOption } from "./time-range-tabs";

export type ChannelMetric =
  | "revenue"
  | "orders"
  | "customers"
  | "transactions"
  | "delivery-fees"
  | "points-utilised";
export type ChannelScope = "total" | "website" | "home-delivery" | "store-pickup" | "instore";

interface ChannelSeriesApiResult {
  value: number;
  change: { pct: number };
  series: { date: string; value: number }[];
  /** Only present for metric="transactions" — the 1000/month baseline, prorated to the range. */
  target?: number | null;
}

const ENDPOINTS: Record<ChannelMetric, string> = {
  revenue: "/api/admin/stats/revenue",
  orders: "/api/admin/stats/orders",
  customers: "/api/admin/stats/customers",
  transactions: "/api/admin/stats/transactions",
  "delivery-fees": "/api/admin/stats/delivery-fees",
  "points-utilised": "/api/admin/stats/points-utilised",
};

interface ChannelStatCardProps {
  title: string;
  metric: ChannelMetric;
  /** Omit for metric="customers" (no channel breakdown). */
  scope?: ChannelScope;
  accent?: MetricAccent;
  presets?: readonly TimeRangeOption[];
  defaultRange?: string;
  valueFormatter?: (v: number) => string;
  changeLabel?: string;
  /** Divide the value by the number of buckets in the series — for "average per day" style cards. */
  averagePerDay?: boolean;
  className?: string;
}

export function ChannelStatCard({
  title,
  metric,
  scope,
  accent = "emerald",
  presets = TIME_RANGE_PRESETS.dashboard,
  defaultRange = "30d",
  valueFormatter = (v) => formatCompact(v),
  changeLabel = "vs prior period",
  averagePerDay = false,
  className,
}: ChannelStatCardProps) {
  const [range, setRange] = useState(defaultRange);
  const [view, setView] = useState<ChartView>("curve");

  const { data, isLoading } = useQuery<{ ok: boolean; data: ChannelSeriesApiResult }>({
    queryKey: ["channel-stat", metric, scope ?? "n/a", range],
    queryFn: () =>
      fetch(`${ENDPOINTS[metric]}?range=${range}${scope ? `&scope=${scope}` : ""}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const result = data?.data;
  const rawValue = result?.value ?? 0;
  const days = result?.series.length || 1;
  const value = averagePerDay ? rawValue / days : rawValue;
  const change = result?.change.pct ?? 0;
  const isPositive = change >= 0;
  const colors = ACCENTS[accent];

  const chartSeries = result?.series.length
    ? [{ name: title, data: result.series, color: colors.stroke }]
    : [];

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border",
        className
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</span>
        <div className="flex items-center gap-1.5">
          <TimeRangeTabs value={range} onChange={setRange} options={presets} />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
      ) : (
        <>
          <div className="mb-1">
            <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {valueFormatter(value)}
            </span>
            {result?.target != null && (
              <span className="ml-2 text-sm text-neutral-400">/ {valueFormatter(result.target)}</span>
            )}
          </div>
          {result?.target != null && (
            <div className="mb-3">
              <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${Math.min((value / result.target) * 100, 100)}%` }}
                />
              </div>
              <span className="mt-1 block text-xs text-neutral-400">
                {Math.round((value / result.target) * 100)}% of expected
              </span>
            </div>
          )}
          <div className="mb-4 flex items-center gap-1">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                isPositive
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}
            >
              {isPositive ? "+" : ""}
              {change.toFixed(1)}%
            </span>
            <span className="text-xs text-neutral-400">{changeLabel}</span>
          </div>
          {chartSeries.length > 0 && (
            <div className="h-20">
              <MetricChart series={chartSeries} view={view} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
