"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

export interface FunnelStage {
  label: string;
  value: number;
  gradient?: { offset: string; color: string }[];
}

interface PatternLinesProps {
  id: string;
  color?: string;
}

export function PatternLines({ id, color = "#e5e7eb" }: PatternLinesProps) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="1" />
      </pattern>
    </defs>
  );
}

interface FunnelChartProps {
  data: FunnelStage[];
  layers?: number;
  className?: string;
  onSegmentClick?: (stage: FunnelStage, index: number) => void;
  valueFormatter?: (v: number) => string;
}

export function FunnelChart({
  data,
  layers = 3,
  className,
  onSegmentClick,
  valueFormatter = (v) => v.toLocaleString(),
}: FunnelChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const COLORS = [
    ["#10b981", "#059669"],
    ["#3b82f6", "#2563eb"],
    ["#f59e0b", "#d97706"],
    ["#8b5cf6", "#7c3aed"],
    ["#f43f5e", "#e11d48"],
    ["#06b6d4", "#0891b2"],
  ];

  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      {data.map((stage, i) => {
        const pct = (stage.value / maxValue) * 100;
        const colors = stage.gradient
          ? [stage.gradient[0]?.color ?? "#10b981", stage.gradient[1]?.color ?? "#059669"]
          : COLORS[i % COLORS.length];
        const isHovered = hovered === i;
        const convPct = i > 0 && data[i - 1].value > 0
          ? ((stage.value / data[i - 1].value) * 100).toFixed(0)
          : null;

        return (
          <motion.div
            key={i}
            className="relative"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSegmentClick?.(stage, i)}
            style={{ cursor: onSegmentClick ? "pointer" : "default" }}
          >
            {/* Funnel row */}
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-right">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 truncate">
                  {stage.label}
                </span>
              </div>
              <div className="flex-1 relative h-8 rounded overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{
                    background: `linear-gradient(90deg, ${colors[0]}, ${colors[1]})`,
                    opacity: isHovered ? 1 : 0.85,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease: "easeOut" }}
                />
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      className="absolute inset-0 flex items-center px-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <span className="text-xs text-white font-semibold drop-shadow">
                        {valueFormatter(stage.value)} ({pct.toFixed(1)}%)
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="w-20 shrink-0">
                <span className="text-xs text-neutral-900 dark:text-neutral-100 font-semibold">
                  {valueFormatter(stage.value)}
                </span>
                {convPct && (
                  <span className="ml-1 text-[10px] text-neutral-400">({convPct}%)</span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
