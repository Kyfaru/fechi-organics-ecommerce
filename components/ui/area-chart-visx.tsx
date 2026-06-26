"use client";
import { useMemo, useCallback, useState } from "react";
import { AreaClosed, Line, Bar } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { GridRows, GridColumns } from "@visx/grid";
import { scaleTime, scaleLinear } from "@visx/scale";
import { LinearGradient } from "@visx/gradient";
import { localPoint } from "@visx/event";
import { bisector, extent, max } from "d3-array";
import useMeasure from "react-use-measure";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface DataPoint {
  date: string;
  value: number;
  [key: string]: string | number;
}

// Internal type — extends DataPoint but allows _date: Date.
// Using a separate interface avoids index-signature conflicts.
type ParsedDataPoint = {
  _date: Date;
  date: string;
  value: number;
  [key: string]: string | number | Date;
};

interface VisxAreaChartProps {
  data: DataPoint[];
  dataKey?: string;
  color?: string;
  height?: number;
  className?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  valueFormatter?: (v: number) => string;
  dateFormatter?: (d: string) => string;
  multiSeries?: { key: string; color: string; label: string }[];
}

const MARGIN = { top: 10, right: 10, bottom: 30, left: 40 };

export function VisxAreaChart({
  data,
  dataKey = "value",
  color = "var(--chart-line-primary, #10b981)",
  height = 200,
  className,
  showGrid = true,
  showTooltip = true,
  valueFormatter = (v) => v.toLocaleString(),
  dateFormatter = (d) => d,
  multiSeries,
}: VisxAreaChartProps) {
  const [ref, bounds] = useMeasure();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; item: ParsedDataPoint } | null>(null);

  const width = bounds.width || 300;
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);

  const parsedData = useMemo(
    () =>
      data.map(
        (d) =>
          ({ ...d, _date: new Date(d.date) }) as ParsedDataPoint
      ),
    [data]
  );

  const xScale = useMemo(
    () =>
      scaleTime({
        range: [0, innerWidth],
        domain: extent(parsedData, (d) => d._date) as [Date, Date],
      }),
    [parsedData, innerWidth]
  );

  const series = multiSeries ?? [{ key: dataKey, color, label: dataKey }];

  const allValues = parsedData.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0)));
  const maxVal = max(allValues) ?? 0;

  const yScale = useMemo(
    () =>
      scaleLinear({
        range: [innerHeight, 0],
        domain: [0, maxVal * 1.1],
        nice: true,
      }),
    [innerHeight, maxVal]
  );

  const bisectDate = bisector<ParsedDataPoint, Date>((d) => d._date).left;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (!showTooltip) return;
      const point = localPoint(e) ?? { x: 0, y: 0 };
      const x0 = xScale.invert(point.x - MARGIN.left);
      const idx = bisectDate(parsedData, x0, 1);
      const d0 = parsedData[idx - 1];
      const d1 = parsedData[idx];
      let d = d0;
      if (d1 && x0.getTime() - d0._date.getTime() > d1._date.getTime() - x0.getTime()) d = d1;
      if (!d) return;
      setTooltip({
        x: xScale(d._date) + MARGIN.left,
        y: yScale(Number(d[series[0].key] ?? 0)) + MARGIN.top,
        item: d,
      });
    },
    [xScale, yScale, parsedData, bisectDate, series, showTooltip]
  );

  if (!data.length) return <div className={cn("flex items-center justify-center h-full text-neutral-400 text-sm", className)}>No data</div>;

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      <svg width={width} height={height}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`visx-area-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {showGrid && (
            <>
              <GridRows scale={yScale} width={innerWidth} stroke="var(--chart-grid, #e5e7eb)" strokeOpacity={0.5} numTicks={4} />
              <GridColumns scale={xScale} height={innerHeight} stroke="var(--chart-grid, #e5e7eb)" strokeOpacity={0.3} numTicks={6} />
            </>
          )}

          {series.map((s) => (
            <g key={s.key}>
              <AreaClosed
                data={parsedData}
                x={(d) => xScale(d._date)}
                y={(d) => yScale(Number(d[s.key] ?? 0))}
                yScale={yScale}
                strokeWidth={2}
                stroke={s.color}
                fill={`url(#visx-area-grad-${s.key})`}
                curve={curveMonotoneX}
              />
            </g>
          ))}

          {/* X axis labels */}
          {parsedData.filter((_, i) => i % Math.ceil(parsedData.length / 5) === 0).map((d, i) => (
            <text
              key={i}
              x={xScale(d._date)}
              y={innerHeight + 20}
              textAnchor="middle"
              fontSize={10}
              fill="var(--chart-label, #9ca3af)"
            >
              {dateFormatter(d.date)}
            </text>
          ))}

          {/* Y axis labels */}
          {yScale.ticks(4).map((tick, i) => (
            <text
              key={i}
              x={-8}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--chart-label, #9ca3af)"
            >
              {valueFormatter(tick)}
            </text>
          ))}

          {/* Crosshair */}
          {tooltip && showTooltip && (
            <Line
              from={{ x: tooltip.x - MARGIN.left, y: 0 }}
              to={{ x: tooltip.x - MARGIN.left, y: innerHeight }}
              stroke="var(--chart-crosshair, #d1d5db)"
              strokeWidth={1}
              strokeDasharray="4 2"
              pointerEvents="none"
            />
          )}

          {/* Invisible mouse capture rect */}
          <Bar
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          />
        </g>
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute pointer-events-none z-50 rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg dark:bg-dark-surface dark:border-dark-border"
            style={{ left: tooltip.x + 8, top: Math.max(tooltip.y - 20, 8) }}
          >
            <p className="text-xs text-neutral-400 mb-1">{dateFormatter(tooltip.item.date)}</p>
            {series.map((s) => (
              <p key={s.key} className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: s.color }} />
                {s.label}: {valueFormatter(Number(tooltip.item[s.key] ?? 0))}
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
