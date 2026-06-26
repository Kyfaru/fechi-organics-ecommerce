"use client";
import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { cn } from "@/lib/utils";

interface StatCardAnimatedProps {
  title: string;
  value: number;
  change: number;
  changeDescription: string;
  icon: React.ReactNode;
  className?: string;
  valueFormatter?: (v: number) => string;
}

export function StatCardAnimated({
  title,
  value,
  change,
  changeDescription,
  icon,
  className,
  valueFormatter = (v) => v.toLocaleString(),
}: StatCardAnimatedProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate(latest) {
        el.textContent = valueFormatter(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [value, valueFormatter]);

  const isPositive = change >= 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border",
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
          {icon}
        </div>
      </div>
      <div className="mb-2">
        <span
          ref={ref}
          className="text-2xl font-bold text-neutral-900 dark:text-neutral-100"
        >
          {valueFormatter(0)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
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
        <span className="text-xs text-neutral-400">{changeDescription}</span>
      </div>
    </div>
  );
}
