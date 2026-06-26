"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MetricChart, formatCompact, ACCENTS, type ChartSeries, type ChartView, type MetricAccent, type SeriesPoint } from "./metric-chart";
import { PeriodSelect, ViewToggle, type PeriodOption } from "./metric-controls";

interface ProgressMetricCardProps {
  title: string;
  value: number;
  target?: number;
  change?: number;
  changeLabel?: string;
  series?: MetricSeries[];
  accent?: MetricAccent;
  valueFormatter?: (v: number) => string;
  periodOptions?: PeriodOption[];
  className?: string;
}

interface MetricSeries {
  name: string;
  data: SeriesPoint[];
  color?: string;
}

const DEFAULT_PERIODS: PeriodOption[] = [
  { label: "7d", points: 7 },
  { label: "30d", points: 30 },
  { label: "90d", points: 90 },
];

export function ProgressMetricCard({
  title,
  value,
  target,
  change,
  changeLabel,
  series = [],
  accent = "emerald",
  valueFormatter = (v) => formatCompact(v),
  periodOptions = DEFAULT_PERIODS,
  className,
}: ProgressMetricCardProps) {
  const [view, setView] = useState<ChartView>("curve");
  const [period, setPeriod] = useState<PeriodOption>(periodOptions[0]);

  const colors = ACCENTS[accent];
  const progress = target ? Math.min((value / target) * 100, 100) : null;
  const isPositive = (change ?? 0) >= 0;

  const chartSeries: ChartSeries[] = series.map((s, i) => ({
    name: s.name,
    data: period.points ? s.data.slice(-period.points) : s.data,
    color: s.color ?? [colors.stroke, "#94a3b8"][i] ?? "#94a3b8",
  }));

  return (
    <div className={cn("rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</span>
        <div className="flex items-center gap-2">
          {periodOptions.length > 1 && (
            <PeriodSelect
              value={period.label}
              options={periodOptions}
              onChange={setPeriod}
            />
          )}
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {/* Value */}
      <div className="mb-1">
        <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          {valueFormatter(value)}
        </span>
        {target && (
          <span className="ml-2 text-sm text-neutral-400">/ {valueFormatter(target)}</span>
        )}
      </div>

      {/* Change badge */}
      {change !== undefined && (
        <div className="flex items-center gap-1 mb-4">
          <span
            className={cn(
              "text-xs font-semibold rounded-full px-1.5 py-0.5",
              isPositive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {isPositive ? "+" : ""}{change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-xs text-neutral-400">{changeLabel}</span>
          )}
        </div>
      )}

      {/* Progress bar */}
      {progress !== null && (
        <div className="mb-4">
          <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className={cn("h-full rounded-full transition-all duration-500", colors.bg.replace("bg-", "bg-").replace("-50", "-500"))}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-neutral-400 mt-1 block">{progress.toFixed(0)}% of target</span>
        </div>
      )}

      {/* Chart */}
      {chartSeries.length > 0 && (
        <div className="h-20">
          <MetricChart series={chartSeries} view={view} />
        </div>
      )}
    </div>
  );
}
