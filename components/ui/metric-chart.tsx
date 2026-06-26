"use client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

export type SeriesPoint = { value: number; date: string };
export type ChartView = "curve" | "bar";
export type MetricAccent = "emerald" | "rose" | "blue" | "amber" | "violet" | "neutral";

export interface ChartSeries {
  name: string;
  data: SeriesPoint[];
  color: string;
}

export interface MetricSeries {
  name: string;
  data: SeriesPoint[];
  accent?: MetricAccent;
}

export const ACCENTS: Record<MetricAccent, { stroke: string; text: string; bg: string }> = {
  emerald: { stroke: "#10b981", text: "text-emerald-600", bg: "bg-emerald-50" },
  rose: { stroke: "#f43f5e", text: "text-rose-600", bg: "bg-rose-50" },
  blue: { stroke: "#3b82f6", text: "text-blue-600", bg: "bg-blue-50" },
  amber: { stroke: "#f59e0b", text: "text-amber-600", bg: "bg-amber-50" },
  violet: { stroke: "#8b5cf6", text: "text-violet-600", bg: "bg-violet-50" },
  neutral: { stroke: "#6b7280", text: "text-neutral-600", bg: "bg-neutral-50" },
};

export const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--neutral-400)",
];

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface MetricChartProps {
  series: ChartSeries[];
  view: ChartView;
  defaultIndex?: number;
  valueFormatter?: (value: number) => string;
  dateFormatter?: (date: string) => string;
}

export function MetricChart({ series, view }: MetricChartProps) {
  const primary = series[0];
  if (!primary) return null;

  const chartData = primary.data.map((p, i) => {
    const row: Record<string, unknown> = { date: p.date };
    series.forEach((s) => {
      row[s.name] = s.data[i]?.value ?? 0;
    });
    return row;
  });

  if (view === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          {series.map((s) => (
            <Bar key={s.name} dataKey={s.name} fill={s.color} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.name} id={`grad-${s.name}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {series.map((s) => (
          <Area
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#grad-${s.name})`}
            dot={false}
            activeDot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
