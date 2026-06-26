"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface DonutChartSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutChartSegment[];
  size?: number;
  strokeWidth?: number;
  centerContent?: React.ReactNode;
  className?: string;
  showLegend?: boolean;
  valueFormatter?: (v: number) => string;
}

export function DonutChart({
  data,
  size = 200,
  strokeWidth = 28,
  centerContent,
  className,
  showLegend = true,
  valueFormatter = (v) => v.toLocaleString(),
}: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let cumulativeAngle = -Math.PI / 2;

  const segments = data.map((seg, i) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const dashLength = fraction * circumference;
    const gapLength = circumference - dashLength;
    const startAngle = cumulativeAngle;
    cumulativeAngle += fraction * 2 * Math.PI;

    return {
      ...seg,
      index: i,
      dashLength,
      gapLength,
      startAngle,
      strokeDashoffset: -startAngle * radius,
    };
  });

  const active = hovered !== null ? data[hovered] : null;

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="overflow-visible">
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-neutral-100 dark:text-neutral-800"
          />
          {segments.map((seg, i) => {
            const isHovered = hovered === i;
            const offset = isHovered ? 4 : 0;
            return (
              <motion.circle
                key={i}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? strokeWidth + offset : strokeWidth}
                strokeDasharray={`${seg.dashLength} ${seg.gapLength}`}
                strokeDashoffset={-(seg.startAngle + Math.PI / 2) * radius}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="round"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                animate={{ strokeWidth: isHovered ? strokeWidth + offset : strokeWidth }}
                transition={{ duration: 0.15 }}
              />
            );
          })}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div
                key={active.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="text-center"
              >
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{active.label}</p>
                <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{valueFormatter(active.value)}</p>
                <p className="text-xs text-neutral-400">{total > 0 ? ((active.value / total) * 100).toFixed(1) : 0}%</p>
              </motion.div>
            ) : (
              <motion.div
                key="center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                {centerContent ?? (
                  <>
                    <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{valueFormatter(total)}</p>
                    <p className="text-xs text-neutral-400">Total</p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {showLegend && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {data.map((seg, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
              <span className="text-xs text-neutral-600 dark:text-neutral-400">{seg.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
