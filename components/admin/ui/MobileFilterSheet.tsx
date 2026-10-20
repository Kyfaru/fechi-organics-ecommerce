"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Drawer } from "./Drawer";
import { PriceRangeSlider } from "@/components/ui/PriceRangeSlider";
import { PRICE_MIN, PRICE_MAX } from "@/lib/price-range-steps";

type Opt = { value: string; label: string };
type Range = { min: number; max: number };
type DateVal = { from: string; to: string };

export type FilterGroup =
  | { type: "single"; key: string; label: string; value: string; onChange: (v: string) => void; options: Opt[]; allLabel?: string }
  | { type: "multi"; key: string; label: string; value: string[]; onChange: (v: string[]) => void; options: Opt[] }
  | { type: "range"; key: string; label: string; value: Range; onChange: (v: Range) => void }
  | { type: "date"; key: string; label: string; from: string; to: string; onChange: (from: string, to: string) => void };

export const FULL_RANGE: Range = { min: PRICE_MIN, max: PRICE_MAX };

function activeCount(groups: FilterGroup[]) {
  return groups.filter((g) => {
    if (g.type === "single") return g.value !== "";
    if (g.type === "multi") return g.value.length > 0;
    if (g.type === "range") return g.value.min > PRICE_MIN || g.value.max < PRICE_MAX;
    return !!(g.from || g.to);
  }).length;
}

// Phone-only filter entry point: one icon button -> full-page sheet.
// Edits are drafted locally and committed to the page's real filter state on Apply.
export function MobileFilterSheet({ groups, title = "Filters" }: { groups: FilterGroup[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const count = activeCount(groups);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={count ? `Filters (${count} active)` : "Filters"}
        className="sm:hidden relative h-10 w-10 shrink-0 flex items-center justify-center rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) text-(--neutral-700) dark:text-(--dark-text) active:scale-95 transition"
      >
        <SlidersHorizontal size={18} />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-(--green-800) text-white text-[10px] font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
      <Drawer confirmClose={false} open={open} onClose={() => setOpen(false)} title={title}>
        <SheetBody groups={groups} onDone={() => setOpen(false)} />
      </Drawer>
    </>
  );
}

type Draft = Record<string, string | string[] | Range | DateVal>;

function SheetBody({ groups, onDone }: { groups: FilterGroup[]; onDone: () => void }) {
  // Mounted fresh on every open (Drawer unmounts children), so this snapshot is always current.
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.type === "date" ? { from: g.from, to: g.to } : g.value])),
  );
  const set = (key: string, v: Draft[string]) => setDraft((d) => ({ ...d, [key]: v }));

  function apply() {
    for (const g of groups) {
      const v = draft[g.key];
      if (g.type === "single") g.onChange(v as string);
      else if (g.type === "multi") g.onChange(v as string[]);
      else if (g.type === "range") g.onChange(v as Range);
      else g.onChange((v as DateVal).from, (v as DateVal).to);
    }
    onDone();
  }
  function reset() {
    setDraft(
      Object.fromEntries(
        groups.map((g) => [
          g.key,
          g.type === "single" ? "" : g.type === "multi" ? [] : g.type === "range" ? FULL_RANGE : { from: "", to: "" },
        ]),
      ),
    );
  }

  const row =
    "flex items-center gap-3 min-h-12 px-1 font-dm text-[15px] text-(--neutral-900) dark:text-(--dark-text) active:bg-(--neutral-50) dark:active:bg-(--dark-border) rounded-[8px]";

  return (
    <div className="flex flex-col min-h-full -m-4">
      <div className="flex-1 p-4 space-y-6">
        {groups.map((g) => (
          <section key={g.key}>
            <h4 className="font-dm text-[11px] font-semibold uppercase tracking-wider text-(--neutral-500) dark:text-(--dark-muted) mb-2">
              {g.label}
            </h4>
            {g.type === "single" && (
              <div role="radiogroup" className="divide-y divide-(--neutral-100) dark:divide-(--dark-border)">
                {[{ value: "", label: g.allLabel ?? "All" }, ...g.options].map((o) => (
                  <label key={o.value || "__all"} className={row}>
                    <input
                      type="radio"
                      name={g.key}
                      checked={(draft[g.key] as string) === o.value}
                      onChange={() => set(g.key, o.value)}
                      className="h-5 w-5 accent-(--green-800)"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            )}
            {g.type === "multi" && (
              <div className="divide-y divide-(--neutral-100) dark:divide-(--dark-border)">
                {g.options.map((o) => {
                  const cur = draft[g.key] as string[];
                  return (
                    <label key={o.value} className={row}>
                      <input
                        type="checkbox"
                        checked={cur.includes(o.value)}
                        onChange={(e) => set(g.key, e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))}
                        className="h-5 w-5 rounded accent-(--green-800)"
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            )}
            {g.type === "range" && (
              <div className="px-1 pt-1">
                <PriceRangeSlider value={draft[g.key] as Range} onChange={(v) => set(g.key, v)} />
              </div>
            )}
            {g.type === "date" && (
              <div className="grid grid-cols-2 gap-3">
                {(["from", "to"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="block font-dm text-[12px] text-(--neutral-500) mb-1">{k === "from" ? "From" : "To"}</span>
                    <input
                      type="date"
                      value={(draft[g.key] as DateVal)[k]}
                      onChange={(e) => set(g.key, { ...(draft[g.key] as DateVal), [k]: e.target.value })}
                      className="w-full h-11 px-3 rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-bg) font-dm text-[16px] text-(--neutral-900) dark:text-(--dark-text)"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="sticky bottom-0 flex gap-3 p-4 border-t border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          onClick={reset}
          className="flex-1 h-12 rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) font-dm text-[15px] font-medium text-(--neutral-700) dark:text-(--dark-text) active:scale-[.97] transition"
        >
          Reset
        </button>
        <button
          onClick={apply}
          className="flex-[2] h-12 rounded-[10px] bg-(--green-800) text-white font-dm text-[15px] font-semibold active:scale-[.97] transition"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
