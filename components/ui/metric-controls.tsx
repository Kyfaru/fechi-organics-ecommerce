"use client";
import type { ChartView } from "./metric-chart";
import { cn } from "@/lib/utils";

export type PeriodOption = { label: string; points?: number };

interface PeriodSelectProps {
  value: string;
  options: PeriodOption[];
  onChange: (option: PeriodOption) => void;
  accentText?: string;
}

export function PeriodSelect({ value, options, onChange, accentText }: PeriodSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const opt = options.find((o) => o.label === e.target.value);
        if (opt) onChange(opt);
      }}
      className={cn(
        "text-xs rounded-lg border border-neutral-200 bg-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-dark-surface dark:border-dark-border dark:text-neutral-200",
        accentText
      )}
    >
      {options.map((o) => (
        <option key={o.label} value={o.label}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface ViewToggleProps {
  value: ChartView;
  onChange: (view: ChartView) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-neutral-200 p-0.5 dark:border-dark-border">
      <button
        onClick={() => onChange("curve")}
        className={cn(
          "rounded p-1 transition-colors",
          value === "curve"
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
            : "text-neutral-400 hover:text-neutral-600"
        )}
        aria-label="Line chart"
        title="Line chart"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <polyline points="1,10 4,6 7,8 10,3 13,5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      <button
        onClick={() => onChange("bar")}
        className={cn(
          "rounded p-1 transition-colors",
          value === "bar"
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
            : "text-neutral-400 hover:text-neutral-600"
        )}
        aria-label="Bar chart"
        title="Bar chart"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="7" width="3" height="6" rx="0.5" fill="currentColor" />
          <rect x="5.5" y="4" width="3" height="9" rx="0.5" fill="currentColor" />
          <rect x="10" y="1" width="3" height="12" rx="0.5" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
