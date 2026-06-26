"use client";
import { useEffect, useRef } from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";

const COLOR_MAP = {
  green: { stroke: "var(--green-500)", fill: "rgba(34,197,94,0.1)" },
  gold: { stroke: "var(--gold-500, #eab308)", fill: "rgba(234,179,8,0.1)" },
  danger: { stroke: "var(--danger, #ef4444)", fill: "rgba(239,68,68,0.1)" },
  info: { stroke: "var(--info, #3b82f6)", fill: "rgba(59,130,246,0.1)" },
};

interface StatsWidgetProps {
  title: string;
  metric: string;
  change?: number;
  changeLabel?: string;
  sparkData?: number[];
  color?: "green" | "gold" | "danger" | "info";
  icon?: React.ReactNode;
  onRefresh?: () => void;
  className?: string;
}

export function StatsWidget({
  title,
  metric,
  change,
  changeLabel,
  sparkData = [],
  color = "green",
  icon,
  onRefresh,
  className,
}: StatsWidgetProps) {
  const colors = COLOR_MAP[color];
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!onRefresh) return;
    timerRef.current = setInterval(() => onRefresh(), 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onRefresh]);

  const chartData = sparkData.map((v, i) => ({ i, v }));
  const isPositive = (change ?? 0) >= 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border",
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</span>
          <p className="text-2xl font-bold mt-1 text-neutral-900 dark:text-neutral-100">{metric}</p>
        </div>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
            {icon}
          </div>
        )}
      </div>

      {change !== undefined && (
        <div className="flex items-center gap-1.5 mb-3">
          <span
            className={cn(
              "text-xs font-semibold rounded-full px-1.5 py-0.5",
              isPositive
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {isPositive ? "+" : ""}{change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-xs text-neutral-400">{changeLabel}</span>
          )}
        </div>
      )}

      {chartData.length > 1 && (
        <div className="h-14">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`sw-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.stroke} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors.stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={colors.stroke}
                strokeWidth={2}
                fill={`url(#sw-grad-${color})`}
                dot={false}
                activeDot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
