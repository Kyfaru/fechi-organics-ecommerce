"use client";
import { cn } from "@/lib/utils";

export interface TimeRangeOption {
  id: string;
  label: string;
}

/** Shared range presets, reused across Dashboard/Finance/Reports stat cards. */
export const TIME_RANGE_PRESETS = {
  dashboard: [
    { id: "today", label: "Today" },
    { id: "3d", label: "3d" },
    { id: "7d", label: "7d" },
    { id: "30d", label: "30d" },
    { id: "60d", label: "60d" },
    { id: "all", label: "All" },
  ],
  reports: [
    { id: "today", label: "Today" },
    { id: "7d", label: "7d" },
    { id: "30d", label: "30d" },
    { id: "60d", label: "60d" },
    { id: "90d", label: "90d" },
    { id: "all", label: "All" },
  ],
} as const satisfies Record<string, readonly TimeRangeOption[]>;

interface TimeRangeTabsProps {
  value: string;
  onChange: (id: string) => void;
  options: readonly TimeRangeOption[];
  className?: string;
}

export function TimeRangeTabs({ value, onChange, options, className }: TimeRangeTabsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-neutral-200 p-0.5 dark:border-dark-border",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap",
            value === o.id
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
              : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
