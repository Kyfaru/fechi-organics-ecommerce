"use client";

import { useState, type ReactNode } from "react";
import { ChevronUp, ChevronDown, Package } from "lucide-react";
import { SkeletonTableRow } from "./Skeleton";
import { EmptyState } from "./EmptyState";

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  loading?: boolean;
  onRowClick?: (row: Record<string, unknown>) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
}

export function DataTable({
  columns, data, loading, onRowClick,
  emptyTitle = "No data",
  emptyDescription = "Nothing to show yet.",
  pageSize = 20,
}: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(0);
  }

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, sorted.length);

  return (
    <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-(--green-50) dark:bg-(--dark-bg) border-b border-(--neutral-200) dark:border-(--dark-border)">
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`px-4 py-3 text-left font-dm text-[13px] font-semibold uppercase tracking-wider text-(--neutral-500) dark:text-(--dark-muted) whitespace-nowrap ${col.sortable ? "cursor-pointer select-none hover:text-(--neutral-900) dark:hover:text-(--dark-accent)" : ""}`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={columns.length} className="p-0"><SkeletonTableRow /></td></tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState icon={Package} title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-(--neutral-200) dark:border-(--dark-border) transition-colors h-14 ${i % 2 === 1 ? "bg-(--green-50) dark:bg-(--dark-bg)" : "bg-white dark:bg-(--dark-surface)"} ${onRowClick ? "cursor-pointer hover:bg-(--green-100) dark:hover:bg-(--dark-border)" : ""}`}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-4 font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text)">
                      {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg)">
          <span className="font-dm text-[13px] text-(--green-800) dark:text-(--dark-muted)">
            Showing {from}–{to} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="h-8 w-8 flex items-center justify-center rounded-[6px] font-dm text-[13px] text-(--green-800) dark:text-(--dark-text) hover:bg-(--green-100) dark:hover:bg-(--dark-border) disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`h-8 w-8 flex items-center justify-center rounded-[6px] font-dm text-[13px] transition-colors ${
                  i === page ? "bg-(--green-800) text-white dark:bg-(--dark-accent) dark:text-(--dark-bg)" : "text-(--green-800) dark:text-(--dark-text) hover:bg-(--green-100) dark:hover:bg-(--dark-border)"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={page === totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="h-8 w-8 flex items-center justify-center rounded-[6px] font-dm text-[13px] text-(--green-800) dark:text-(--dark-text) hover:bg-(--green-100) dark:hover:bg-(--dark-border) disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
