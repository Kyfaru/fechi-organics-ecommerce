"use client";
import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateRange {
  start: string;
  end: string;
}

interface ChartFilterProps {
  value?: DateRange | null;
  onChange?: (range: DateRange | null) => void;
  presets?: { label: string; days: number }[];
  className?: string;
}

const DEFAULT_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function ChartFilter({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className,
}: ChartFilterProps) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(value?.start ?? daysAgo(30));
  const [end, setEnd] = useState(value?.end ?? today());

  const apply = () => {
    onChange?.({ start, end });
    setOpen(false);
  };

  const clear = () => {
    onChange?.(null);
    setOpen(false);
  };

  const applyPreset = (days: number) => {
    const s = daysAgo(days);
    const e = today();
    setStart(s);
    setEnd(e);
    onChange?.({ start: s, end: e });
    setOpen(false);
  };

  const label = value ? `${value.start} → ${value.end}` : "Filter by date";

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:bg-dark-surface dark:border-dark-border dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-neutral-400" />
        <span>{label}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-72 rounded-xl border border-neutral-200 bg-white p-4 shadow-xl dark:bg-dark-surface dark:border-dark-border">
          {/* Presets */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700 dark:border-dark-border dark:text-neutral-300 dark:hover:bg-green-900/20 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="border-t border-neutral-100 dark:border-dark-border pt-3 space-y-2">
            <div>
              <label className="text-xs text-neutral-400 block mb-1">Start date</label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-dark-surface dark:border-dark-border dark:text-neutral-200"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1">End date</label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-dark-surface dark:border-dark-border dark:text-neutral-200"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              onClick={clear}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={apply}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
    </div>
  );
}
