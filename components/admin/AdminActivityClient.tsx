"use client";

/**
 * AdminActivityClient — Admin Activity Log page
 *
 * Ledger-style table of audit log entries.
 * Filters: date range, staff member, resource type.
 * Fetches from GET /api/admin/activity
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Search, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Activity } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ActivityLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  adminProfileId: string;
  staffName: string;
  staffEmail: string;
}

// ---------------------------------------------------------------------------
// Resource type chip
// ---------------------------------------------------------------------------
const RESOURCE_COLORS: Record<string, string> = {
  product:   "bg-[--green-50]  text-[--green-800]",
  order:     "bg-[--gold-100]  text-[--gold-700]",
  customer:  "bg-[--info]/10  text-[--info]",
  setting:   "bg-[--neutral-100] text-[--neutral-700]",
  staff:     "bg-[--green-200] text-[--green-800]",
};

function ResourceChip({ resource }: { resource: string }) {
  const key = resource.toLowerCase();
  const cls = RESOURCE_COLORS[key] ?? "bg-[--neutral-100] text-[--neutral-700]";
  return (
    <span className={`inline-flex h-6 items-center px-2.5 rounded-full font-dm text-[11px] font-medium capitalize ${cls}`}>
      {resource}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-KE", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

function buildQueryString(params: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminActivityClient() {
  const [staffFilter, setStaffFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [applied, setApplied] = useState<{
    staffId: string; resource: string; from: string; to: string;
  }>({ staffId: "", resource: "", from: "", to: "" });

  const qs = buildQueryString({
    staffId:  applied.staffId,
    resource: applied.resource,
    from:     applied.from,
    to:       applied.to,
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-activity", qs],
    queryFn: () =>
      fetch(`/api/admin/activity${qs}`)
        .then((r) => r.json())
        .then((j) => j.data?.logs ?? []),
  });

  const logs: ActivityLog[] = data ?? [];

  function applyFilters() {
    setApplied({
      staffId:  staffFilter,
      resource: resourceFilter,
      from:     fromDate,
      to:       toDate,
    });
  }

  function clearFilters() {
    setStaffFilter("");
    setResourceFilter("");
    setFromDate("");
    setToDate("");
    setApplied({ staffId: "", resource: "", from: "", to: "" });
  }

  const inputCls = "h-9 px-3 rounded-[8px] border border-[--neutral-300] dark:border-[--dark-border] font-dm text-[13px] text-[--neutral-900] dark:text-[--dark-text] bg-white dark:bg-[--dark-surface] outline-none focus:border-[--green-600] transition-colors";

  const columns = [
    {
      key: "createdAt",
      label: "Timestamp",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-mono text-[13px] text-[--neutral-700] dark:text-[--dark-text] whitespace-nowrap">
          {formatTimestamp((row as unknown as ActivityLog).createdAt)}
        </span>
      ),
    },
    {
      key: "staffName",
      label: "Staff",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const log = row as unknown as ActivityLog;
        return (
          <div>
            <div className="font-dm text-[13px] font-medium text-[--neutral-900] dark:text-[--dark-text]">{log.staffName}</div>
            <div className="font-dm text-[11px] text-[--neutral-400]">{log.staffEmail}</div>
          </div>
        );
      },
    },
    {
      key: "action",
      label: "Action",
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[13px] text-[--neutral-700] dark:text-[--dark-text]">
          {(row as unknown as ActivityLog).action}
        </span>
      ),
    },
    {
      key: "resource",
      label: "Entity",
      render: (_: unknown, row: Record<string, unknown>) => (
        <ResourceChip resource={(row as unknown as ActivityLog).resource} />
      ),
    },
    {
      key: "ipAddress",
      label: "IP Address",
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-mono text-[12px] text-[--neutral-400]">
          {(row as unknown as ActivityLog).ipAddress ?? "—"}
        </span>
      ),
    },
  ];

  const hasFilters = applied.staffId || applied.resource || applied.from || applied.to;

  return (
    <div className="min-h-screen bg-[--neutral-50] dark:bg-[--dark-bg]">
      <PageHeader
        title="Activity Log"
        description="Audit trail of all admin actions"
        breadcrumbs={[
          { label: "Staff", href: "/admin/staff" },
          { label: "Activity", href: "/admin/staff/activity" },
        ]}
        action={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 w-9 flex items-center justify-center rounded-[8px] border border-[--neutral-200] text-[--neutral-500] hover:bg-[--neutral-100] transition-colors disabled:opacity-60"
            aria-label="Refresh"
          >
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        {/* Filter toolbar */}
        <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-dm text-[12px] text-[--neutral-500]">Staff email</label>
              <input
                className={inputCls}
                placeholder="jane@..."
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                style={{ width: 200 }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-dm text-[12px] text-[--neutral-500]">Resource type</label>
              <select
                className={`${inputCls} pr-8`}
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
                style={{ width: 150 }}
              >
                <option value="">All types</option>
                {["product", "order", "customer", "setting", "staff"].map((r) => (
                  <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-dm text-[12px] text-[--neutral-500]">From</label>
              <input type="date" className={inputCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-dm text-[12px] text-[--neutral-500]">To</label>
              <input type="date" className={inputCls} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>

            <div className="flex gap-2 ml-auto">
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="h-9 px-4 rounded-[8px] border border-[--neutral-200] font-dm text-[13px] text-[--neutral-600] hover:bg-[--neutral-50] transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={applyFilters}
                className="h-9 px-4 rounded-[8px] bg-[--green-800] hover:bg-[--green-900] font-dm text-[13px] font-medium text-white transition-colors flex items-center gap-1.5"
              >
                <Filter size={13} />
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {!isLoading && logs.length === 0 ? (
          <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1]">
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description={hasFilters ? "No logs match the current filters." : "Activity will appear here once admins start taking actions."}
            />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={logs as unknown as Record<string, unknown>[]}
            loading={isLoading}
            pageSize={25}
            emptyTitle="No activity logs"
            emptyDescription="Logs will appear here once admins take actions."
          />
        )}
      </div>
    </div>
  );
}
