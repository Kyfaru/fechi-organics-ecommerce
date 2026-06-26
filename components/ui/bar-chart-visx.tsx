"use client";
import { useMemo, useState } from "react";
import { Bar } from "@visx/shape";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { LinearGradient } from "@visx/gradient";
import { max } from "d3-array";
import useMeasure from "react-use-measure";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface BarDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface VisxBarChartProps {
  data: BarDataPoint[];
  color?: string;
  height?: number;
  className?: string;
  showGrid?: boolean;
  formatY?: (v: number) => string;
  formatX?: (v: string) => string;
}

const MARGIN = { top: 10, right: 10, bottom: 30, left: 44 };

export function VisxBarChart({
  data,
  color = "var(--chart-1, #10b981)",
  height = 200,
  className,
  showGrid = true,
  formatY = (v) => String(v),
  formatX = (v) => v,
}: VisxBarChartProps) {
  const [ref, bounds] = useMeasure();
  const [hovered, setHovered] = useState<number | null>(null);

  const width = bounds.width || 300;
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);

  const xScale = useMemo(
    () =>
      scaleBand({
        range: [0, innerWidth],
        round: true,
        domain: data.map((d) => d.label),
        padding: 0.25,
      }),
    [data, innerWidth]
  );

  const maxVal = max(data, (d: BarDataPoint) => d.value) ?? 0;

  const yScale = useMemo(
    () =>
      scaleLinear({
        range: [innerHeight, 0],
        round: true,
        domain: [0, maxVal * 1.1],
        nice: true,
      }),
    [innerHeight, maxVal]
  );

  if (!data.length) return <div className={cn("flex items-center justify-center text-neutral-400 text-sm", className)} style={{ height }}>No data</div>;

  const barWidth = xScale.bandwidth();
  const gradId = "visx-bar-grad";

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      {/* Hover tooltip */}
      <AnimatePresence>
        {hovered !== null && data[hovered] && (
          <motion.div
            key={hovered}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-50 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 shadow-lg dark:bg-dark-surface dark:border-dark-border"
          >
            <p className="text-xs text-neutral-400">{data[hovered].label}</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{formatY(data[hovered].value)}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <svg width={width} height={height}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
            <stop offset="100%" stopColor={color} stopOpacity={0.5} />
          </linearGradient>
        </defs>

        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {showGrid && (
            <GridRows scale={yScale} width={innerWidth} stroke="var(--chart-grid, #e5e7eb)" strokeOpacity={0.6} numTicks={4} />
          )}

          {data.map((d, i) => {
            const barHeight = innerHeight - (yScale(d.value) ?? 0);
            const x = xScale(d.label) ?? 0;
            const y = yScale(d.value) ?? 0;
            const isHov = hovered === i;

            return (
              <g key={d.label}>
                <Bar
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={d.color ?? `url(#${gradId})`}
                  opacity={hovered !== null && !isHov ? 0.5 : 1}
                  rx={3}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                />
              </g>
            );
          })}

          {/* X axis labels */}
          {data.map((d, i) => {
            const show = data.length <= 12 || i % Math.ceil(data.length / 8) === 0;
            if (!show) return null;
            return (
              <text
                key={d.label}
                x={(xScale(d.label) ?? 0) + barWidth / 2}
                y={innerHeight + 18}
                textAnchor="middle"
                fontSize={9}
                fill="var(--chart-label, #9ca3af)"
              >
                {formatX(d.label)}
              </text>
            );
          })}

          {/* Y axis labels */}
          {yScale.ticks(4).map((tick, i) => (
            <text
              key={i}
              x={-8}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={9}
              fill="var(--chart-label, #9ca3af)"
            >
              {formatY(tick)}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
