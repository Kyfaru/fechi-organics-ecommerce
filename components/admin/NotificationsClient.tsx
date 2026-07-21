"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Pin, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { SkeletonTableRow } from "@/components/admin/ui/Skeleton";
import { PrelineSelect } from "@/components/admin/ui/PrelineSelect";
import { SeverityBadge } from "@/components/admin/ui/SeverityBadge";
import { useNotificationStream } from "@/hooks/use-notification-stream";
import { useIsMobile } from "@/hooks/use-mobile";

type Severity = "CRITICAL" | "WARNING" | "INFO";
type Tab = "all" | "unread" | "critical" | "pinned";

interface NotificationRow {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  body: string;
  link: string | null;
  branchId: string | null;
  createdAt: string;
  isRead: boolean;
  isPinned: boolean;
}

const TYPE_OPTIONS = [
  "ORDER_NEW", "ORDER_FAILED", "PAYMENT_ERROR", "PRODUCT_ADDED", "PRODUCT_DELETED",
  "STAFF_ADDED", "STAFF_REMOVED", "TICKET_NEW", "TICKET_RESPONSE", "CONTACT_INQUIRY",
  "DELIVERY_ZONE_REQUEST", "ADMIN_ADDED", "SYSTEM_ALERT",
].map((t) => ({ value: t, label: t.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }));

const SEVERITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "WARNING", label: "Warning" },
  { value: "INFO", label: "Info" },
];

const TABS: [Tab, string][] = [
  ["all", "All"],
  ["unread", "Unread"],
  ["critical", "Critical"],
  ["pinned", "Pinned"],
];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

// Today / This Week / Earlier — plain Date math, no date library needed.
function groupByDay(rows: NotificationRow[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfToday - 6 * 86_400_000;

  const groups: { label: string; rows: NotificationRow[] }[] = [
    { label: "Today", rows: [] },
    { label: "This Week", rows: [] },
    { label: "Earlier", rows: [] },
  ];
  for (const row of rows) {
    const t = new Date(row.createdAt).getTime();
    if (t >= startOfToday) groups[0].rows.push(row);
    else if (t >= weekAgo) groups[1].rows.push(row);
    else groups[2].rows.push(row);
  }
  return groups.filter((g) => g.rows.length > 0);
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["admin-notifications-list"] });
  qc.invalidateQueries({ queryKey: ["admin-notifications-unread-count"] });
  qc.invalidateQueries({ queryKey: ["admin-notifications-preview"] });
};

export function NotificationsClient() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [branchId, setBranchId] = useState("");
  const [expandedReceiptsId, setExpandedReceiptsId] = useState<string | null>(null);

  const { data: meData } = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => fetch("/api/admin/me").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const isGlobal = !!(meData?.isSuperAdmin || meData?.role === "admin");

  const { data: branchesData } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: () => fetch("/api/admin/branches").then((r) => r.json()),
    enabled: isGlobal,
    staleTime: 5 * 60 * 1000,
  });
  const branches: { id: string; name: string }[] = branchesData?.data?.branches ?? [];

  const effectiveStatus = tab === "unread" ? "unread" : tab === "pinned" ? "pinned" : "";
  const effectiveSeverity = tab === "critical" ? "CRITICAL" : severity;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (type) params.set("type", type);
    if (effectiveSeverity) params.set("severity", effectiveSeverity);
    if (effectiveStatus) params.set("status", effectiveStatus);
    if (isGlobal && branchId) params.set("branchId", branchId);
    return params.toString();
  }, [search, type, effectiveSeverity, effectiveStatus, isGlobal, branchId]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-notifications-list", queryString],
    queryFn: () => fetch(`/api/admin/notifications?${queryString}`).then((r) => r.json()),
    staleTime: 15 * 1000,
  });
  const notifications: NotificationRow[] = data?.data?.notifications ?? [];

  useNotificationStream(true, () => invalidateAll(qc));

  const markRead = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/notifications/${id}`, { method: "PATCH" }),
    onSuccess: () => invalidateAll(qc),
  });

  const markAllRead = useMutation({
    mutationFn: () => fetch("/api/admin/notifications/mark-all-read", { method: "POST" }),
    onSuccess: () => invalidateAll(qc),
  });

  const togglePin = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/notifications/${id}/pin`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications-list"] }),
  });

  // Design doc: grouped-by-day is a mobile-only presentation — desktop keeps
  // the flat newest-first list the API already returns.
  const groups = useMemo(
    () => (isMobile ? groupByDay(notifications) : [{ label: null as string | null, rows: notifications }]),
    [isMobile, notifications]
  );
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Stay on top of orders, payments, and store activity"
        action={
          unreadCount > 0 ? (
            <button
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1.5 h-9 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[13px] font-medium hover:bg-(--green-900) transition-colors"
            >
              <CheckCheck size={15} />
              Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="px-6 pb-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, message…"
            className="h-10 px-4 flex-1 min-w-[200px] rounded-lg border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) text-[14px] font-dm text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-500)"
          />
          <PrelineSelect options={TYPE_OPTIONS} value={type} onChange={setType} placeholder="All types" className="w-auto min-w-[160px]" />
          <PrelineSelect options={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} placeholder="All severities" className="w-auto min-w-[160px]" />
          {isGlobal && branches.length > 0 && (
            <PrelineSelect
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              value={branchId}
              onChange={setBranchId}
              placeholder="All branches"
              className="w-auto min-w-[160px]"
            />
          )}
        </div>

        <div className="flex items-center gap-1 border-b border-(--neutral-200) dark:border-(--dark-border)">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`px-4 py-2.5 font-dm text-[13px] font-medium border-b-2 transition-colors ${
                tab === value
                  ? "border-(--green-700) text-(--green-800) dark:text-(--dark-accent)"
                  : "border-transparent text-(--neutral-500) hover:text-(--neutral-700)"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <EmptyState icon={Bell} title="No notifications" description="You're all caught up — nothing matches these filters." />
        )}

        {!isLoading &&
          groups.map((group, gi) => (
            <div key={group.label ?? gi} className="space-y-2">
              {group.label && (
                <p className="font-dm text-[12px] font-semibold uppercase tracking-wide text-(--neutral-400)">{group.label}</p>
              )}
              {group.rows.map((n) => (
                <NotificationRowItem
                  key={n.id}
                  notification={n}
                  isGlobal={isGlobal}
                  expanded={expandedReceiptsId === n.id}
                  onToggleReceipts={() => setExpandedReceiptsId(expandedReceiptsId === n.id ? null : n.id)}
                  onMarkRead={() => markRead.mutate(n.id)}
                  onTogglePin={() => togglePin.mutate(n.id)}
                />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function NotificationRowItem({
  notification: n,
  isGlobal,
  expanded,
  onToggleReceipts,
  onMarkRead,
  onTogglePin,
}: {
  notification: NotificationRow;
  isGlobal: boolean;
  expanded: boolean;
  onToggleReceipts: () => void;
  onMarkRead: () => void;
  onTogglePin: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["admin-notification-receipts", n.id],
    queryFn: () => fetch(`/api/admin/notifications/${n.id}/read-receipts`).then((r) => r.json()),
    enabled: isGlobal && expanded,
  });
  const receipts: { userId: string; name: string; readAt: string }[] = data?.data?.receipts ?? [];

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        n.isRead
          ? "bg-white dark:bg-(--dark-surface) border-(--neutral-200) dark:border-(--dark-border)"
          : "bg-(--green-50) dark:bg-(--dark-surface) border-(--green-200) dark:border-(--green-800)"
      }`}
    >
      <div className="flex gap-3">
        <SeverityBadge severity={n.severity} />
        <div className="flex-1 min-w-0">
          <p className={`font-dm text-[14px] ${n.isRead ? "font-medium" : "font-semibold"} text-(--neutral-900) dark:text-(--dark-text)`}>
            {n.title}
            {!n.isRead && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-(--green-600) align-middle" />}
          </p>
          <p className="text-[13px] text-(--neutral-500) dark:text-(--dark-muted) mt-0.5">{n.body}</p>
          <p className="text-[11px] text-(--neutral-400) mt-1">{timeAgo(n.createdAt)}</p>

          {isGlobal && (
            <button onClick={onToggleReceipts} className="mt-1.5 text-[11px] text-(--green-700) hover:underline">
              {expanded ? "Hide read receipts" : "Read by…"}
            </button>
          )}
          {isGlobal && expanded && (
            <div className="mt-1.5 text-[12px] text-(--neutral-500) dark:text-(--dark-muted) space-y-0.5">
              {receipts.length === 0
                ? "Unaddressed — no one has read this yet."
                : receipts.map((r) => (
                    <div key={r.userId}>
                      {r.name} at{" "}
                      {new Date(r.readAt).toLocaleString("en-KE", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                    </div>
                  ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {n.link && (
            <a
              href={n.link}
              className="p-1.5 rounded-lg text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
              title="Go to"
            >
              <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              n.isPinned ? "text-(--gold-700)" : "text-(--neutral-400) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border)"
            }`}
            title={n.isPinned ? "Unpin" : "Pin"}
          >
            <Pin size={14} fill={n.isPinned ? "currentColor" : "none"} />
          </button>
          {!n.isRead && (
            <button
              onClick={onMarkRead}
              className="p-1.5 rounded-lg text-(--green-600) hover:bg-(--green-50) dark:hover:bg-(--dark-border) transition-colors"
              title="Mark read"
            >
              <CheckCheck size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
