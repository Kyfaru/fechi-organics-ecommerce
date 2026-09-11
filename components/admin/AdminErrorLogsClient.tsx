"use client";

/**
 * AdminErrorLogsClient — plain-language error log for non-technical admins.
 *
 * Lists `errorLog` rows (written by lib/observability-server.ts's
 * logServerError, best-effort, alongside Sentry reporting) newest-first, with
 * a friendly headline as the primary line and the raw code/category kept
 * visible as secondary/muted text — this never hides the underlying detail,
 * it only adds a summary on top.
 */

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { EmptyState } from "@/components/admin/ui/EmptyState";

interface ErrorLogRow {
  id: string;
  code: string | null;
  category: string;
  message: string;
  friendlyMessage: string;
  route: string | null;
  userId: string | null;
  orderId: string | null;
  occurredAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  database: "Database",
  payment_gateway: "Payment Gateway",
  server: "Server",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function AdminErrorLogsClient() {
  const highlightId = useSearchParams().get("highlight");
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["admin-error-logs"],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      const qs = pageParam ? `?cursor=${pageParam}` : "";
      const res = await fetch(`/api/admin/error-logs${qs}`);
      const json = await res.json();
      return json.data as { logs: ErrorLogRow[]; nextCursor: string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  });

  const logs: ErrorLogRow[] = useMemo(() => data?.pages.flatMap((p) => p?.logs ?? []) ?? [], [data]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, logs.length]);

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader
        title="Error Logs"
        description="Every unexpected error the store has hit, explained in plain language"
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

      <div className="px-6 pb-6">
        {!isLoading && logs.length === 0 ? (
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1)">
            <EmptyState icon={AlertTriangle} title="No errors logged" description="Nothing unexpected has happened yet — this page will fill in as errors occur." />
          </div>
        ) : (
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) divide-y divide-(--neutral-100) dark:divide-(--dark-border)">
            {logs.map((log) => (
              <div
                key={log.id}
                ref={log.id === highlightId ? highlightRef : undefined}
                className={`p-4 flex items-start gap-3 ${log.id === highlightId ? "bg-(--danger-bg)/40 ring-1 ring-(--danger)/30 rounded-[8px]" : ""}`}
              >
                <div className="w-9 h-9 rounded-full bg-(--danger-bg) flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle size={16} className="text-(--danger)" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-dm text-[14px] font-medium text-(--neutral-900) dark:text-(--dark-text)">
                    {log.friendlyMessage}
                  </p>
                  <p className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted) mt-0.5 break-all">
                    {log.code ? `${log.code} — ` : ""}{log.message}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <span className="inline-flex h-5 items-center px-2 rounded-full font-dm text-[10px] font-medium bg-(--neutral-100) dark:bg-(--dark-border) text-(--neutral-600) dark:text-(--dark-muted)">
                      {CATEGORY_LABELS[log.category] ?? log.category}
                    </span>
                    {log.route && (
                      <span className="font-dm text-[11px] text-(--neutral-400) font-mono">{log.route}</span>
                    )}
                    {log.orderId && (
                      <a href={`/admin/orders/${log.orderId}`} className="font-dm text-[11px] text-(--green-700) hover:underline">
                        View order
                      </a>
                    )}
                    <span className="font-dm text-[11px] text-(--neutral-400)">{formatDateTime(log.occurredAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasNextPage && (
          <div className="flex justify-center pt-4">
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
    </div>
  );
}
