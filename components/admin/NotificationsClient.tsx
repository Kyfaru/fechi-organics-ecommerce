"use client";

import { useMemo, useState } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { Bell } from "lucide-react"; // EmptyState's prop is typed LucideIcon — the one deliberate exception on this page
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { SkeletonTableRow } from "@/components/admin/ui/Skeleton";
import { PrelineSelect } from "@/components/admin/ui/PrelineSelect";
import { SeverityBadge, SEVERITY_MAP, type Severity } from "@/components/admin/ui/SeverityBadge";
import { useNotificationStream } from "@/hooks/use-notification-stream";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAdminMe, checkPermission } from "@/hooks/use-can";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/categories";

type Tab = "all" | "unread" | "critical" | "system" | "pinned";

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

const TABS: [Tab, string][] = [
  ["all", "All"],
  ["unread", "Unread"],
  ["critical", "Critical"],
  ["system", "System"],
  ["pinned", "Pinned"],
];

const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "INFO"];

const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range…" },
];

// Per-type glyph — the icon circle's color comes from severity (below), so
// this only needs to pick a recognizable pictogram per notification type.
const TYPE_ICON: Record<string, string> = {
  ORDER_NEW: "material-symbols:shopping-bag-outline-rounded",
  ORDER_FAILED: "material-symbols:remove-shopping-cart-outline-rounded",
  PAYMENT_ERROR: "material-symbols:credit-card-off-outline-rounded",
  PRODUCT_ADDED: "material-symbols:inventory-2-outline-rounded",
  PRODUCT_DELETED: "material-symbols:delete-outline-rounded",
  LOW_STOCK: "material-symbols:package-2-outline-rounded",
  STAFF_ADDED: "material-symbols:person-add-outline-rounded",
  STAFF_REMOVED: "material-symbols:person-remove-outline-rounded",
  ADMIN_ADDED: "material-symbols:admin-panel-settings-outline-rounded",
  TICKET_NEW: "material-symbols:confirmation-number-outline-rounded",
  TICKET_RESPONSE: "material-symbols:forum-outline-rounded",
  CONTACT_INQUIRY: "material-symbols:mail-outline-rounded",
  DELIVERY_ZONE_REQUEST: "material-symbols:local-shipping-outline-rounded",
  SYSTEM_ALERT: "material-symbols:system-update-alt-rounded",
  APPROVAL_REQUESTED: "material-symbols:verified-user-outline-rounded",
  APPROVAL_DECIDED: "material-symbols:gavel-rounded",
  EXPORT_READY: "material-symbols:download-done-rounded",
};

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

// Same plain-Date-math philosophy as groupByDay — no date library needed for
// the sidebar's "Last 7 days / Last 30 days / This month" presets.
function dateRangeToFrom(range: string): string | undefined {
  const now = new Date();
  if (range === "7d") return new Date(now.getTime() - 7 * 86_400_000).toISOString();
  if (range === "30d") return new Date(now.getTime() - 30 * 86_400_000).toISOString();
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return undefined;
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
  const [category, setCategory] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [severities, setSeverities] = useState<Set<Severity>>(new Set(SEVERITIES));
  const [expandedReceiptsId, setExpandedReceiptsId] = useState<string | null>(null);

  const { data: meData } = useAdminMe();
  const isGlobal = !!(meData?.isSuperAdmin || meData?.role === "admin");

  const { data: branchesData } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: () => fetch("/api/admin/branches").then((r) => r.json()),
    enabled: isGlobal,
    staleTime: 5 * 60 * 1000,
  });
  const branches: { id: string; name: string }[] = branchesData?.data?.branches ?? [];

  const { data: unreadCountData } = useQuery({
    queryKey: ["admin-notifications-unread-count"],
    queryFn: () => fetch("/api/admin/notifications/unread-count").then((r) => r.json()),
    staleTime: 15 * 1000,
  });
  const unreadCount: number = unreadCountData?.data?.count ?? 0;

  // Only offer categories this role can actually see anything in — System is
  // always offered (resources: [] → always visible, e.g. SYSTEM_ALERT).
  const categoryOptions = useMemo(
    () =>
      NOTIFICATION_CATEGORIES.filter(
        (c) => c.resources.length === 0 || c.resources.some((r) => checkPermission(meData, { [r]: ["view"] }))
      ).map((c) => ({ value: c.id, label: c.label })),
    [meData]
  );

  const toggleSeverity = (s: Severity) =>
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const resetFilters = () => {
    setSearch("");
    setCategory("");
    setDateRange("");
    setCustomFrom("");
    setCustomTo("");
    setBranchId("");
    setSeverities(new Set(SEVERITIES));
  };

  const effectiveStatus = tab === "unread" ? "unread" : tab === "pinned" ? "pinned" : "";
  const effectiveCategory = tab === "system" ? "system" : category;
  // All-or-nothing checked = "no filter"; tab="critical" always wins.
  const effectiveSeverities =
    tab === "critical" ? (["CRITICAL"] as Severity[]) : severities.size === SEVERITIES.length ? [] : [...severities];
  const from = dateRange === "custom" ? (customFrom ? new Date(customFrom).toISOString() : undefined) : dateRangeToFrom(dateRange);
  const to = dateRange === "custom" && customTo ? new Date(customTo).toISOString() : undefined;

  const effectiveSeverityParam = effectiveSeverities.join(",");
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (effectiveCategory) params.set("category", effectiveCategory);
    if (effectiveSeverityParam) params.set("severity", effectiveSeverityParam);
    if (effectiveStatus) params.set("status", effectiveStatus);
    if (isGlobal && branchId) params.set("branchId", branchId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [search, effectiveCategory, effectiveSeverityParam, effectiveStatus, isGlobal, branchId, from, to]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["admin-notifications-list", queryString],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      fetch(`/api/admin/notifications?${queryString}${pageParam ? `&cursor=${pageParam}` : ""}`).then((r) => r.json()),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage?.data?.nextCursor ?? null,
    staleTime: 15 * 1000,
  });
  const notifications: NotificationRow[] = useMemo(
    () => data?.pages.flatMap((p) => p?.data?.notifications ?? []) ?? [],
    [data]
  );

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

  const dismiss = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateAll(qc),
  });

  // Design doc: grouped-by-day is a mobile-only presentation — desktop keeps
  // the flat newest-first list the API already returns.
  const groups = useMemo(
    () => (isMobile ? groupByDay(notifications) : [{ label: null as string | null, rows: notifications }]),
    [isMobile, notifications]
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Home", href: "/admin" },
          { label: "Settings", href: "/admin/notifications" },
          { label: "Notifications", href: "/admin/notifications" },
        ]}
        title="Notifications"
        description="Stay on top of orders, payments, and store activity"
        action={
          unreadCount > 0 ? (
            <button
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1.5 h-9 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[13px] font-medium hover:bg-(--green-900) transition-colors"
            >
              <Icon icon="material-symbols:done-all-rounded" width={15} height={15} />
              Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="px-6 pb-8 flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Main feed */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="flex items-center gap-1 border-b border-(--neutral-200) dark:border-(--dark-border) overflow-x-auto">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`px-4 py-2.5 font-dm text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === value
                    ? "border-(--green-700) text-(--green-800) dark:text-(--dark-accent)"
                    : "border-transparent text-(--neutral-500) hover:text-(--neutral-700)"
                }`}
              >
                {label}
                {value === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
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
              <div key={group.label ?? gi} className="space-y-3">
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
                    onDismiss={() => dismiss.mutate(n.id)}
                  />
                ))}
              </div>
            ))}

          {!isLoading && hasNextPage && (
            <div className="mt-2 flex justify-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="font-dm text-[13px] font-medium text-(--green-700) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) py-2 px-6 rounded-full transition-colors border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) disabled:opacity-60"
              >
                {isFetchingNextPage ? "Loading…" : "Load more notifications"}
              </button>
            </div>
          )}
        </div>

        {/* Filters sidebar */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-white dark:bg-(--dark-surface) rounded-xl border border-(--neutral-200) dark:border-(--dark-border) p-5 lg:sticky lg:top-6 flex flex-col gap-4">
            <h3 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">Filters</h3>

            <div className="relative">
              <Icon
                icon="material-symbols:search-rounded"
                width={18}
                height={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400)"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search keywords…"
                className="w-full h-10 pl-10 pr-3 rounded-lg border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-bg) text-[13px] font-dm text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-500) focus:ring-1 focus:ring-(--green-500)"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-dm text-[12px] font-medium text-(--neutral-500)">Date Range</label>
              <PrelineSelect options={DATE_RANGE_OPTIONS} value={dateRange} onChange={setDateRange} placeholder="Any time" />
              {dateRange === "custom" && (
                <div className="flex gap-2 mt-1">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-bg) text-[12px] font-dm text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-500)"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-bg) text-[12px] font-dm text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-500)"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-dm text-[12px] font-medium text-(--neutral-500)">Category</label>
              <PrelineSelect options={categoryOptions} value={category} onChange={setCategory} placeholder="All categories" />
            </div>

            {isGlobal && branches.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="font-dm text-[12px] font-medium text-(--neutral-500)">Branch</label>
                <PrelineSelect
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  value={branchId}
                  onChange={setBranchId}
                  placeholder="All branches"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="font-dm text-[12px] font-medium text-(--neutral-500)">Severity</label>
              <div className="flex flex-col gap-2 mt-1">
                {SEVERITIES.map((s) => (
                  <label key={s} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={severities.has(s)}
                      onChange={() => toggleSeverity(s)}
                      className="w-4 h-4 rounded border-(--neutral-300) text-(--green-700) focus:ring-(--green-500)"
                    />
                    <span className="font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text) group-hover:text-(--green-800) transition-colors">
                      {SEVERITY_MAP[s].label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <hr className="border-(--neutral-200) dark:border-(--dark-border) my-1" />
            <button
              onClick={resetFilters}
              className="font-dm text-[13px] font-medium text-(--neutral-500) hover:text-(--neutral-800) dark:hover:text-(--dark-text) py-1 text-left transition-colors"
            >
              Reset all filters
            </button>
          </div>
        </div>
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
  onDismiss,
}: {
  notification: NotificationRow;
  isGlobal: boolean;
  expanded: boolean;
  onToggleReceipts: () => void;
  onMarkRead: () => void;
  onTogglePin: () => void;
  onDismiss: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["admin-notification-receipts", n.id],
    queryFn: () => fetch(`/api/admin/notifications/${n.id}/read-receipts`).then((r) => r.json()),
    enabled: isGlobal && expanded,
  });
  const receipts: { userId: string; name: string; readAt: string }[] = data?.data?.receipts ?? [];

  const sev = SEVERITY_MAP[n.severity];
  const barColor = n.severity === "CRITICAL" ? "bg-red-600" : n.severity === "WARNING" ? "bg-amber-500" : "bg-blue-500";
  const icon = TYPE_ICON[n.type] ?? "material-symbols:notifications-outline-rounded";

  return (
    <div className="relative overflow-hidden rounded-xl border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) p-5 flex gap-4 items-start hover:border-(--neutral-300) dark:hover:border-(--dark-muted) transition-colors group">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${barColor}`} />

      <div className={`w-10 h-10 rounded-full ${sev.bg} ${sev.text} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon icon={icon} width={20} height={20} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex justify-between items-start gap-4">
          <h3
            className={`font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) truncate ${
              n.isRead ? "font-medium" : "font-semibold"
            }`}
          >
            {n.title}
          </h3>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {n.link && (
              <a
                href={n.link}
                className="p-1.5 rounded-md text-(--neutral-500) hover:text-(--green-700) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
                title="Go to"
              >
                <Icon icon="material-symbols:open-in-new-rounded" width={15} height={15} />
              </a>
            )}
            {!n.isRead && (
              <button
                onClick={onMarkRead}
                className="p-1.5 rounded-md text-(--neutral-500) hover:text-(--green-700) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
                title="Mark read"
              >
                <Icon icon="material-symbols:done-rounded" width={15} height={15} />
              </button>
            )}
            <button
              onClick={onTogglePin}
              className={`p-1.5 rounded-md transition-colors ${
                n.isPinned
                  ? "text-(--gold-700)"
                  : "text-(--neutral-500) hover:text-(--green-700) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border)"
              }`}
              title={n.isPinned ? "Unpin" : "Pin"}
            >
              <Icon icon={n.isPinned ? "material-symbols:push-pin-rounded" : "material-symbols:push-pin-outline-rounded"} width={15} height={15} />
            </button>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-md text-(--neutral-500) hover:text-red-700 hover:bg-red-50 dark:hover:bg-(--dark-border) transition-colors"
              title="Dismiss"
            >
              <Icon icon="material-symbols:delete-outline-rounded" width={15} height={15} />
            </button>
          </div>
        </div>

        <p className="font-dm text-[13px] text-(--neutral-600) dark:text-(--dark-muted)">{n.body}</p>

        <div className="flex items-center gap-3 flex-wrap">
          <SeverityBadge severity={n.severity} />
          <span className="font-dm text-[11px] text-(--neutral-400)">{timeAgo(n.createdAt)}</span>
          {n.isRead && (
            <>
              <span className="w-1 h-1 rounded-full bg-(--neutral-300)" />
              <span className="font-dm text-[11px] text-(--neutral-400)">Read</span>
            </>
          )}
        </div>

        {isGlobal && (
          <button onClick={onToggleReceipts} className="mt-0.5 text-[11px] font-dm text-(--green-700) hover:underline self-start">
            {expanded ? "Hide read receipts" : "Read by…"}
          </button>
        )}
        {isGlobal && expanded && (
          <div className="text-[12px] font-dm text-(--neutral-500) dark:text-(--dark-muted) space-y-0.5">
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

      {!n.isRead && <div className="w-2 h-2 rounded-full bg-(--green-600) shrink-0 self-center" />}
    </div>
  );
}
