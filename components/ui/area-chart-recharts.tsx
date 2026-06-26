"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

interface RDataPoint {
  [key: string]: string | number;
}

interface RSeriesConfig {
  key: string;
  label: string;
  color: string;
}

interface RechartsAreaChartProps {
  data: RDataPoint[];
  series: RSeriesConfig[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  className?: string;
  xKey?: string;
  valueFormatter?: (v: number) => string;
}

export function RechartsAreaChart({
  data,
  series,
  height = 200,
  showGrid = true,
  showLegend = false,
  className,
  xKey = "date",
  valueFormatter,
}: RechartsAreaChartProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`rch-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e5e7eb)" strokeOpacity={0.5} />
          )}
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10, fill: "var(--chart-label, #9ca3af)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--chart-label, #9ca3af)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={valueFormatter}
          />
          <Tooltip
            contentStyle={{
              background: "var(--chart-tooltip-bg, #fff)",
              border: "1px solid var(--chart-tooltip-border, #e5e7eb)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "var(--chart-tooltip-text, #111827)",
            }}
            formatter={valueFormatter ? (value) => [valueFormatter(value as number)] : undefined}
          />
          {showLegend && <Legend />}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#rch-grad-${s.key})`}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Named exports with "R" prefix for disambiguation
export { RechartsAreaChart as RAreaChart };
export type { RSeriesConfig, RDataPoint };
