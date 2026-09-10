"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

export interface DateRangeValue {
  from: Date | null;
  to: Date | null;
}

interface DateTimeRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  withTime?: boolean;
  placeholder?: string;
  className?: string;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}
function isSameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtShort(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

// Mon-first 6x7 grid — days outside the target month render as empty
// placeholders (matching the sample markup's disabled out-of-month cells)
// rather than being separately clickable, to keep range-selection logic
// unambiguous about which month a click belongs to.
function buildMonthGrid(monthStart: Date): (Date | null)[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // Mon=0..Sun=6
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function applyTime(date: Date, hour12: number, minute: number, pm: boolean): Date {
  const hour24 = pm ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12;
  const next = new Date(date);
  next.setHours(hour24, minute, 0, 0);
  return next;
}
function to12Hour(date: Date): { hour: number; minute: number; pm: boolean } {
  const h = date.getHours();
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: date.getMinutes(), pm: h >= 12 };
}

/**
 * Reusable date(+time) range popover — recolored from the Preline demo
 * markup (blue) to the site's brand green/gold tokens, matching
 * PrelineSelect/PrelineDatePicker's border/focus/dark-mode conventions.
 * Simplification vs. the demo markup: one shared prev/next control spans
 * both calendar panes (the right pane always shows left-pane-month+1)
 * instead of independently jumpable per-pane month/year selects — real
 * date math + arrow navigation covers the same need with far less code.
 */
export function DateTimeRangePicker({ value, onChange, withTime = false, placeholder = "Select date range", className = "" }: DateTimeRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(value.from ?? new Date()));
  const [draftFrom, setDraftFrom] = useState<Date | null>(value.from);
  const [draftTo, setDraftTo] = useState<Date | null>(value.to);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function openPicker() {
    setDraftFrom(value.from);
    setDraftTo(value.to);
    setViewMonth(startOfMonth(value.from ?? new Date()));
    setOpen(true);
  }

  function pickDay(day: Date) {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(withTime && draftFrom ? applyTime(day, ...Object.values(to12Hour(draftFrom)) as [number, number, boolean]) : day);
      setDraftTo(null);
      return;
    }
    if (day < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(day);
    } else {
      setDraftTo(day);
    }
  }

  function isInRange(day: Date): boolean {
    if (!draftFrom || !draftTo) return false;
    return day > draftFrom && day < draftTo;
  }

  function apply() {
    onChange({ from: draftFrom, to: draftTo ?? draftFrom });
    setOpen(false);
  }
  function cancel() {
    setOpen(false);
  }

  function renderMonth(monthStart: Date) {
    const cells = buildMonthGrid(monthStart);
    return (
      <div className="p-3 space-y-0.5">
        <div className="text-center font-dm text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text) pb-2">
          {monthLabel(monthStart)}
        </div>
        <div className="flex pb-1">
          {WEEKDAYS.map((w) => (
            <span key={w} className="w-9 block text-center text-[11px] font-dm text-(--neutral-400)">{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="w-9 h-9" />;
            const selected = isSameDay(day, draftFrom) || isSameDay(day, draftTo);
            const inRange = isInRange(day);
            return (
              <button
                key={i}
                type="button"
                onClick={() => pickDay(day)}
                className={[
                  "w-9 h-9 flex items-center justify-center text-[13px] font-dm rounded-full transition-colors",
                  selected
                    ? "bg-(--green-800) text-white font-semibold"
                    : inRange
                    ? "bg-(--green-50) dark:bg-(--dark-border) text-(--green-800) dark:text-(--dark-accent)"
                    : "text-(--neutral-700) dark:text-(--dark-text) hover:border hover:border-(--green-700)",
                ].join(" ")}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTimeSelect(which: "from" | "to") {
    const d = which === "from" ? draftFrom : draftTo;
    if (!d) return null;
    const { hour, minute, pm } = to12Hour(d);
    const set = which === "from" ? setDraftFrom : setDraftTo;
    return (
      <div className="flex items-center gap-1.5">
        <select
          value={hour}
          onChange={(e) => set(applyTime(d, Number(e.target.value), minute, pm))}
          className="h-8 px-1.5 rounded-md border border-[#c8d7c3] dark:border-(--dark-border) dark:bg-(--dark-surface) text-[12px] font-dm"
        >
          {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="text-(--neutral-400)">:</span>
        <select
          value={minute}
          onChange={(e) => set(applyTime(d, hour, Number(e.target.value), pm))}
          className="h-8 px-1.5 rounded-md border border-[#c8d7c3] dark:border-(--dark-border) dark:bg-(--dark-surface) text-[12px] font-dm"
        >
          {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
        </select>
        <select
          value={pm ? "PM" : "AM"}
          onChange={(e) => set(applyTime(d, hour, minute, e.target.value === "PM"))}
          className="h-8 px-1.5 rounded-md border border-[#c8d7c3] dark:border-(--dark-border) dark:bg-(--dark-surface) text-[12px] font-dm"
        >
          <option>AM</option>
          <option>PM</option>
        </select>
      </div>
    );
  }

  const label = value.from ? `${fmtShort(value.from)}${value.to && !isSameDay(value.from, value.to) ? ` – ${fmtShort(value.to)}` : ""}` : "";

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="w-full h-10 px-3 flex items-center gap-2 rounded-lg border border-[#c8d7c3] bg-white text-sm text-left focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] focus:outline-none dark:bg-(--dark-surface) dark:border-(--dark-border) dark:text-(--dark-text)"
      >
        <CalendarIcon size={15} className="text-(--neutral-400) shrink-0" />
        <span className={label ? "text-(--neutral-900) dark:text-(--dark-text)" : "text-(--neutral-400)"}>
          {label || placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[min(90vw,620px)] flex flex-col bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e3) rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-3">
            <button type="button" onClick={() => setViewMonth((m) => addMonths(m, -1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) text-(--neutral-700) dark:text-(--dark-text)">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) text-(--neutral-700) dark:text-(--dark-text)">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="sm:flex divide-y sm:divide-y-0 sm:divide-x divide-(--neutral-100) dark:divide-(--dark-border)">
            {renderMonth(viewMonth)}
            {renderMonth(addMonths(viewMonth, 1))}
          </div>

          {withTime && (draftFrom || draftTo) && (
            <div className="px-4 py-3 border-t border-(--neutral-100) dark:border-(--dark-border) flex flex-wrap items-center gap-4">
              {draftFrom && (
                <div className="flex items-center gap-2">
                  <span className="font-dm text-[11px] text-(--neutral-400) uppercase">From time</span>
                  {renderTimeSelect("from")}
                </div>
              )}
              {draftTo && (
                <div className="flex items-center gap-2">
                  <span className="font-dm text-[11px] text-(--neutral-400) uppercase">To time</span>
                  {renderTimeSelect("to")}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-3 px-4 border-t border-(--neutral-200) dark:border-(--dark-border)">
            <span className="text-[12px] font-dm text-(--neutral-500) dark:text-(--dark-muted)">
              {draftFrom ? `${fmtShort(draftFrom)}${draftTo ? ` – ${fmtShort(draftTo)}` : ""}` : "Pick a start date"}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button type="button" onClick={cancel} className="h-9 px-3 rounded-lg border border-(--neutral-200) dark:border-(--dark-border) text-[13px] font-dm text-(--neutral-700) dark:text-(--dark-text) hover:bg-(--neutral-50) dark:hover:bg-(--dark-border)">
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!draftFrom}
                className="h-9 px-4 rounded-lg bg-(--green-800) text-white text-[13px] font-dm font-medium hover:bg-(--green-900) disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
