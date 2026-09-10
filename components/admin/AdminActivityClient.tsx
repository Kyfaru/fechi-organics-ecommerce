"use client";

/**
 * AdminActivityClient — Admin Activity Log
 *
 * Day-grouped timeline of every logged admin action (see lib/admin-activity.ts
 * for the write side). Fetches from GET /api/admin/activity, which is
 * restricted to admin/super_admin.
 */

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { Search, RefreshCw, ChevronDown, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PrelineSelect } from "@/components/admin/ui/PrelineSelect";
import { ChartFilter } from "@/components/ui/chart-filter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Severity = "INFO" | "WARNING" | "CRITICAL";

interface ActivityLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  severity: Severity;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  path: string | null;
  createdAt: string;
  adminProfileId: string;
  staffName: string;
  staffEmail: string;
}

const RESOURCE_OPTIONS = [
  "product", "order", "customer", "inventory", "staff", "setting",
  "branch", "blog", "campaign", "testimonial", "faq", "promotion",
  "approval", "finance",
];

const SEVERITY_STYLES: Record<Severity, { dot: string; icon: string; iconColor: string; label: string; chip: string }> = {
  INFO:     { dot: "bg-blue-400",  icon: "mdi:information-outline", iconColor: "#3b82f6", label: "Info",     chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  WARNING:  { dot: "bg-amber-500", icon: "mdi:alert-outline",       iconColor: "#d97706", label: "Warning",  chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  CRITICAL: { dot: "bg-red-600",   icon: "mdi:alert-octagon-outline", iconColor: "#dc2626", label: "Critical", chip: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// Debounces a fast-changing value (search input) so we don't refetch on every keystroke.
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function buildQueryString(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
}

// ---------------------------------------------------------------------------
// Row detail (expandable — critical entries default to a visible toggle)
// ---------------------------------------------------------------------------
function DetailToggle({ log }: { log: ActivityLog }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(log.details ?? {});
  if (entries.length === 0 && !log.resourceId) return null;

  return (
    <div className="mt-1 -ms-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1 inline-flex items-center gap-x-1.5 text-xs rounded-lg text-(--neutral-500) dark:text-(--dark-muted) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
      >
        {open ? "Hide details" : "Details"}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg) p-3 space-y-1.5">
              {log.resourceId && (
                <div className="flex gap-2 text-[12px] font-dm">
                  <span className="text-(--neutral-400) shrink-0">Resource ID</span>
                  <span className="font-mono text-(--neutral-700) dark:text-(--dark-text) break-all">{log.resourceId}</span>
                </div>
              )}
              {entries.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-[12px] font-dm">
                  <span className="text-(--neutral-400) shrink-0 capitalize">{key}</span>
                  <span className="text-(--neutral-700) dark:text-(--dark-text) break-all">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
              {log.ipAddress && (
                <div className="flex gap-2 text-[12px] font-dm">
                  <span className="text-(--neutral-400) shrink-0">IP</span>
                  <span className="font-mono text-(--neutral-700) dark:text-(--dark-text)">{log.ipAddress}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resource multi-select (checkbox popover — small fixed list, no need for a
// full multi-select component library)
// ---------------------------------------------------------------------------
function ResourceMultiSelect({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (r: string) => onChange(selected.includes(r) ? selected.filter((x) => x !== r) : [...selected, r]);
  const label = selected.length === 0 ? "All areas" : selected.length === 1 ? selected[0] : `${selected.length} areas`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-9 px-3 rounded-[8px] border border-(--neutral-300) dark:border-(--dark-border) font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text) bg-white dark:bg-(--dark-surface) hover:bg-(--neutral-50) dark:hover:bg-(--dark-border) transition-colors capitalize flex items-center gap-1.5"
      >
        {label}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full left-0 mt-1 z-50 w-56 max-h-72 overflow-y-auto rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) shadow-(--e2) p-2">
            {RESOURCE_OPTIONS.map((r) => (
              <label key={r} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-(--neutral-50) dark:hover:bg-(--dark-border) cursor-pointer capitalize font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text)">
                <input type="checkbox" checked={selected.includes(r)} onChange={() => toggle(r)} className="accent-(--green-800)" />
                {r}
              </label>
            ))}
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="w-full mt-1 px-2 py-1 text-left font-dm text-[12px] text-(--neutral-400) hover:text-(--neutral-600)">
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminActivityClient() {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<string>("");
  const [resources, setResources] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const debouncedSearch = useDebounced(search, 350);

  const filters = {
    q: debouncedSearch || undefined,
    severity: severity || undefined,
    resource: resources.length > 0 ? resources.join(",") : undefined,
    from: dateRange?.start,
    to: dateRange ? `${dateRange.end}T23:59:59` : undefined,
  };
  const baseQs = buildQueryString(filters);

  const { data, isLoading, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["admin-activity", baseQs],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      const qs = pageParam ? `${baseQs}${baseQs ? "&" : ""}cursor=${pageParam}` : baseQs;
      const res = await fetch(`/api/admin/activity${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      return json.data as { logs: ActivityLog[]; nextCursor: string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  });

  const logs: ActivityLog[] = useMemo(() => data?.pages.flatMap((p) => p?.logs ?? []) ?? [], [data]);

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; logs: ActivityLog[] }[] = [];
    for (const log of logs) {
      const key = dayKey(log.createdAt);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.key === key) lastGroup.logs.push(log);
      else groups.push({ key, label: dayLabel(log.createdAt), logs: [log] });
    }
    return groups;
  }, [logs]);

  const hasFilters = Boolean(search || severity || resources.length > 0 || dateRange);

  function clearFilters() {
    setSearch("");
    setSeverity("");
    setResources([]);
    setDateRange(null);
  }

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader
        title="Activity Log"
        description="Every action taken by admins and staff, across every branch"
        action={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 w-9 flex items-center justify-center rounded-[8px] border border-(--neutral-200) text-(--neutral-500) hover:bg-(--neutral-100) transition-colors disabled:opacity-60"
            aria-label="Refresh"
          >
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        {/* Filter toolbar */}
        <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-4 flex flex-wrap items-center gap-3">
          <div className="relative w-[240px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions or staff…"
              className="w-full h-9 pl-9 pr-3 rounded-[8px] border border-(--neutral-300) dark:border-(--dark-border) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) bg-white dark:bg-(--dark-surface) outline-none focus:border-(--green-600) transition-colors"
            />
          </div>

          <ChartFilter value={dateRange} onChange={setDateRange} />

          <div className="w-[150px]">
            <PrelineSelect
              value={severity}
              onChange={setSeverity}
              placeholder="All severities"
              options={[
                { value: "INFO", label: "Info" },
                { value: "WARNING", label: "Warning" },
                { value: "CRITICAL", label: "Critical" },
              ]}
            />
          </div>

          <ResourceMultiSelect selected={resources} onChange={setResources} />

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-600) hover:bg-(--neutral-50) transition-colors ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Timeline */}
        {!isLoading && logs.length === 0 ? (
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1)">
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description={hasFilters ? "No logs match the current filters." : "Activity will appear here once admins start taking actions."}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
            {grouped.map((group) => (
              <div key={group.key} className="mb-6 last:mb-0">
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-dm text-[12px] font-semibold text-(--neutral-500) dark:text-(--dark-muted) uppercase tracking-[0.6px] whitespace-nowrap">
                    {group.label}
                  </span>
                  <div className="h-px flex-1 bg-(--neutral-200) dark:bg-(--dark-border)" />
                </div>

                <div className="w-full">
                  {group.logs.map((log, i) => {
                    const sev = SEVERITY_STYLES[log.severity] ?? SEVERITY_STYLES.INFO;
                    const isLast = i === group.logs.length - 1;
                    return (
                      <div key={log.id} className="flex gap-x-3">
                        <div className="min-w-14 text-end">
                          <span className="text-xs text-(--neutral-500) dark:text-(--dark-muted)">{formatTime(log.createdAt)}</span>
                        </div>

                        <div className={`relative ${isLast ? "" : "after:absolute after:top-7 after:bottom-0 after:start-3.5 after:-translate-x-px after:border-s after:border-(--neutral-200) dark:after:border-(--dark-border)"}`}>
                          <div className="relative z-10 size-7 flex justify-center items-center">
                            <Icon icon={sev.icon} width={18} height={18} color={sev.iconColor} />
                          </div>
                        </div>

                        <div className="grow pt-0.5 pb-6">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text)">
                              {log.action}
                            </span>
                            <span className={`inline-flex h-5 items-center px-2 rounded-full font-dm text-[10px] font-semibold uppercase tracking-wide ${sev.chip}`}>
                              {sev.label}
                            </span>
                            <span className="inline-flex h-5 items-center px-2 rounded-full font-dm text-[10px] font-medium capitalize bg-(--neutral-100) dark:bg-(--dark-border) text-(--neutral-600) dark:text-(--dark-muted)">
                              {log.resource}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="mt-1 -ms-1 p-1 inline-flex items-center gap-x-2 text-xs rounded-lg text-(--neutral-500) dark:text-(--dark-muted) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
                          >
                            <span className="flex shrink-0 justify-center items-center size-4 bg-white dark:bg-(--dark-bg) border border-(--neutral-200) dark:border-(--dark-border) text-[9px] font-medium uppercase text-(--neutral-700) dark:text-(--dark-text) rounded-full">
                              {initials(log.staffName)}
                            </span>
                            {log.staffName}
                          </button>
                          <DetailToggle log={log} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="h-9 px-5 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text) hover:bg-(--neutral-50) dark:hover:bg-(--dark-border) transition-colors disabled:opacity-60"
                >
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
