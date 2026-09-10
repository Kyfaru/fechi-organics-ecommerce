"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { AlertTriangle, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SkeletonStatCard, SkeletonChart } from "@/components/admin/ui/Skeleton";
import { ChannelStatCard } from "@/components/ui/channel-stat-card";
import { StatSetSlider } from "@/components/ui/stat-set-slider";
import { TIME_RANGE_PRESETS } from "@/components/ui/time-range-tabs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RecentOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  totalKes: number;
  createdAt: string;
  user: { name: string; email: string } | null;
};

type DashboardData = {
  recentOrders: RecentOrder[];
  ordersByStatus: { status: string; count: number }[];
};

type AnalyticsData = {
  granularity: "hourly" | "daily" | "weekly" | "monthly";
  buckets: string[];
  series: { orders: number[]; revenue: number[]; clients: number[] };
};

type AnalyticsPoint = { label: string; value: number };

type Ticket = {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  lastActivityAt: string;
  user: { name: string; email: string } | null;
};

type Notification = { id: string; title: string; message: string; type: string; createdAt: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RANGES = ["24h", "7d", "14d", "30d", "3m", "6m", "12m", "All"] as const;
type RangeKey = typeof RANGES[number] | "custom";

const ORDER_STATUS_COLORS: Record<string, string> = {
  DELIVERED: "var(--green-500)",
  PICKED_UP: "var(--green-500)",
  SHIPPED: "var(--info)",
  PROCESSING: "var(--gold-500)",
  CONFIRMED: "#8B5CF6",
  PENDING: "var(--neutral-400)",
  CANCELLED: "var(--danger)",
};

const QUICK_ACTIONS = [
  { href: "/admin/products?action=new", label: "＋ New Product" },
  { href: "/admin/customers?action=new", label: "＋ New User" },
  { href: "/admin/orders", label: "View Orders" },
  { href: "/admin/content/testimonials?action=new", label: "＋ Testimonial" },
  { href: "/admin/content/blog?action=new", label: "＋ Blog Post" },
  { href: "/admin/marketing", label: "Campaigns" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatKesCompact(cents: number) {
  const v = cents / 100;
  if (v >= 1_000_000) return `KES ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `KES ${(v / 1_000).toFixed(1)}K`;
  return `KES ${v.toLocaleString()}`;
}

function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function chartDateLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Shared chart primitives (module-scope — no hook rule issues)
// ---------------------------------------------------------------------------
const sharedGrid = (
  <CartesianGrid strokeDasharray="3 3" stroke="var(--neutral-200)" opacity={0.4} />
);

function sharedXAxis(formatter?: (v: string) => string) {
  return (
    <XAxis
      dataKey="label"
      tickFormatter={formatter ?? chartDateLabel}
      tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }}
      axisLine={false}
      tickLine={false}
      minTickGap={24}
    />
  );
}

function sharedYAxis(formatter: (v: number) => string, width?: number) {
  return (
    <YAxis
      tickFormatter={formatter}
      tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }}
      axisLine={false}
      tickLine={false}
      width={width ?? 48}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) rounded-[8px] px-3 py-2 shadow-(--e2)">
      <p className="font-dm text-[12px] text-(--neutral-500) mb-1">
        {label ? chartDateLabel(label) : ""}
      </p>
      <p className="font-syne text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
        {format(payload[0].value)}
      </p>
    </div>
  );
}

function ChartError() {
  return (
    <div className="rounded-[8px] bg-(--danger)/10 border border-(--danger)/30 px-4 py-3">
      <p className="font-dm text-[13px] text-(--danger)">
        Failed to load — try refreshing
      </p>
    </div>
  );
}

function ChartHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
        {title}
      </h2>
      <p className="font-dm text-[13px] text-(--neutral-400)">{subtitle}</p>
    </div>
  );
}

function rangePillClass(active: boolean) {
  return active
    ? "bg-(--green-800) text-white dark:bg-(--dark-accent) dark:text-(--dark-bg) rounded-full px-3 h-8 font-dm text-[13px] font-medium transition-colors flex items-center"
    : "bg-transparent text-(--neutral-500) dark:text-(--dark-muted) hover:bg-(--green-50) dark:hover:bg-(--dark-border) rounded-full px-3 h-8 font-dm text-[13px] font-medium transition-colors flex items-center";
}

const cardClass =
  "bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminDashboardClient() {
  const { data, isLoading } = useQuery<{ ok: boolean; data: DashboardData }>({
    queryKey: ["admin-dashboard"],
    queryFn: () => fetch("/api/admin/dashboard").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const [range, setRange] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [statSet, setStatSet] = useState(0);

  const {
    data: analyticsResp,
    isLoading: analyticsLoading,
    isError: analyticsError,
  } = useQuery<{ ok: boolean; data: AnalyticsData }>({
    queryKey: ["admin-analytics", range, customFrom, customTo],
    queryFn: () =>
      fetch(
        `/api/admin/dashboard/analytics?range=${range.toLowerCase()}${
          range === "custom" ? `&from=${customFrom}&to=${customTo}` : ""
        }`,
      ).then((r) => r.json()),
    enabled: range !== "custom" || Boolean(customFrom && customTo),
    staleTime: 2 * 60 * 1000,
  });

  const analytics = analyticsResp?.data;

  const { data: ticketsData } = useQuery({
    queryKey: ["admin-tickets-open"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/tickets?status=open");
        if (!res.ok) return { data: { tickets: [] } };
        return res.json();
      } catch { return { data: { tickets: [] } }; }
    },
    staleTime: 60_000,
  });
  const tickets: Ticket[] = ticketsData?.data?.tickets ?? [];
  const newTicketsCount = tickets.filter(
    (t) => Date.now() - new Date(t.createdAt).getTime() < 24 * 60 * 60 * 1000,
  ).length;

  const { data: criticalNotifs } = useQuery({
    queryKey: ["admin-notifications-critical"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/notifications?limit=5&type=error");
        if (!res.ok) return { data: { notifications: [] } };
        return res.json();
      } catch { return { data: { notifications: [] } }; }
    },
    staleTime: 30_000,
  });
  const notifications: Notification[] = criticalNotifs?.data?.notifications ?? [];

  const dashboard = data?.data;

  const today = new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const orderColumns = [
    {
      key: "id",
      label: "Order",
      render: (_v: unknown, row: Record<string, unknown>) => (
        <span className="font-mono text-[13px]">{shortId(String(row.id))}</span>
      ),
    },
    {
      key: "user",
      label: "Customer",
      render: (_v: unknown, row: Record<string, unknown>) => {
        const u = row.user as { name: string; email: string } | null;
        return u ? (
          <div>
            <p className="font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text)">
              {u.name}
            </p>
            <p className="font-dm text-[11px] text-(--neutral-400)">{u.email}</p>
          </div>
        ) : (
          <span className="font-dm text-[13px] text-(--neutral-400)">Guest</span>
        );
      },
    },
    {
      key: "totalKes",
      label: "Total",
      render: (_v: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[13px] font-medium">
          {formatKes(Number(row.totalKes))}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (_v: unknown, row: Record<string, unknown>) => (
        <StatusPill status={String(row.status)} />
      ),
    },
    {
      key: "paymentStatus",
      label: "Payment",
      render: (_v: unknown, row: Record<string, unknown>) => (
        <StatusPill status={String(row.paymentStatus)} />
      ),
    },
    {
      key: "createdAt",
      label: "Date",
      render: (_v: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[12px] text-(--neutral-400)">
          {shortDate(String(row.createdAt))}
        </span>
      ),
    },
  ];

  const statSet1 = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <ChannelStatCard title="Total Revenue" metric="revenue" scope="total" accent="emerald" valueFormatter={formatKesCompact} />
      <ChannelStatCard title="Website Revenue" metric="revenue" scope="website" accent="blue" valueFormatter={formatKesCompact} />
      <ChannelStatCard title="Home Delivery Revenue" metric="revenue" scope="home-delivery" accent="violet" valueFormatter={formatKesCompact} />
      <ChannelStatCard title="Store Pickup Revenue" metric="revenue" scope="store-pickup" accent="amber" valueFormatter={formatKesCompact} />
    </div>
  );

  const statSet2 = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <ChannelStatCard title="Instore Revenue" metric="revenue" scope="instore" accent="rose" valueFormatter={formatKesCompact} />
      <ChannelStatCard title="Total Orders" metric="orders" scope="total" accent="blue" presets={TIME_RANGE_PRESETS.dashboard} valueFormatter={(v) => v.toLocaleString()} />
      <ChannelStatCard title="New Customers" metric="customers" accent="emerald" presets={TIME_RANGE_PRESETS.dashboard} valueFormatter={(v) => v.toLocaleString()} />
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border">
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Open &amp; New Tickets</span>
        <div className="mt-3 flex items-end gap-6">
          <div>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{tickets.length}</p>
            <p className="text-xs text-neutral-400">Open</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{newTicketsCount}</p>
            <p className="text-xs text-neutral-400">New (24h)</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        goldWash
        action={
          <span className="font-dm text-[13px] text-(--neutral-500)">{today}</span>
        }
      />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 px-6 pb-4 pt-2">
        {QUICK_ACTIONS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="h-9 px-4 rounded-full border border-(--green-500) dark:border-(--dark-accent) text-(--green-700) dark:text-(--dark-accent) font-dm text-[13px] font-medium hover:bg-(--green-50) dark:hover:bg-(--dark-accent)/10 transition-colors flex items-center gap-1.5"
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="px-6 pb-8 space-y-6">
        {/* Stat Cards — two transitioning sets */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
        ) : (
          <StatSetSlider sets={[statSet1, statSet2]} index={statSet} onChange={setStatSet} />
        )}

        {/* Shared Range Picker */}
        <div className={cardClass}>
          <div className="flex flex-wrap items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(r);
                  setShowCustom(false);
                }}
                className={rangePillClass(range === r)}
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setShowCustom((s) => !s);
                setRange("custom");
              }}
              className={rangePillClass(range === "custom")}
            >
              Custom
            </button>
          </div>
          {showCustom && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <label className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted) flex items-center gap-2">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2 py-1 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) font-dm text-[12px] text-(--neutral-900) dark:text-(--dark-text)"
                />
              </label>
              <label className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted) flex items-center gap-2">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2 py-1 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) font-dm text-[12px] text-(--neutral-900) dark:text-(--dark-text)"
                />
              </label>
              {!(customFrom && customTo) && (
                <span className="font-dm text-[12px] text-(--neutral-400)">
                  Select both dates to load
                </span>
              )}
            </div>
          )}
        </div>

        {/* Orders + Revenue — 2-column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={cardClass}>
            <ChartHeader
              title="Orders"
              subtitle={analytics ? `Order count per ${analytics.granularity} period` : "Order count"}
            />
            {analyticsError ? (
              <ChartError />
            ) : analyticsLoading ? (
              <SkeletonChart />
            ) : (
              (() => {
                const ordersData: AnalyticsPoint[] = analytics
                  ? analytics.buckets.map((b, i) => ({ label: b, value: analytics.series.orders[i] ?? 0 }))
                  : [];
                return ordersData.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center">
                    <p className="font-dm text-[13px] text-(--neutral-400)">No data for this range</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={ordersData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      {sharedGrid}
                      {sharedXAxis()}
                      {sharedYAxis((v) => v.toLocaleString())}
                      <Tooltip
                        content={<ChartTooltip format={(v) => v.toLocaleString()} />}
                        cursor={{ fill: "var(--neutral-100)", opacity: 0.4 }}
                      />
                      <Bar dataKey="value" fill="var(--green-500)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()
            )}
          </div>

          <div className={cardClass}>
            <ChartHeader title="Revenue" subtitle="KES from paid orders" />
            {analyticsError ? (
              <ChartError />
            ) : analyticsLoading ? (
              <SkeletonChart />
            ) : (
              (() => {
                const revenueData: AnalyticsPoint[] = analytics
                  ? analytics.buckets.map((b, i) => ({ label: b, value: analytics.series.revenue[i] ?? 0 }))
                  : [];
                return revenueData.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center">
                    <p className="font-dm text-[13px] text-(--neutral-400)">No data for this range</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={revenueData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--green-500)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="var(--green-500)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      {sharedGrid}
                      {sharedXAxis()}
                      {sharedYAxis((v) => `KES ${(v / 100).toLocaleString()}`, 80)}
                      <Tooltip
                        content={<ChartTooltip format={(v) => `KES ${(v / 100).toLocaleString()}`} />}
                        cursor={{ fill: "var(--neutral-100)", opacity: 0.4 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="var(--green-500)"
                        strokeWidth={2.5}
                        fill="url(#revenueGrad)"
                        isAnimationActive
                        animationDuration={700}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                );
              })()
            )}
          </div>
        </div>

        {/* New Clients — full width (single series, no natural pairing) */}
        <div className={cardClass}>
          <ChartHeader title="New Clients" subtitle="Client registrations over time" />
          {analyticsError ? (
            <ChartError />
          ) : analyticsLoading ? (
            <SkeletonChart />
          ) : (
            (() => {
              const clientsData: AnalyticsPoint[] = analytics
                ? analytics.buckets.map((b, i) => ({ label: b, value: analytics.series.clients[i] ?? 0 }))
                : [];
              return clientsData.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center">
                  <p className="font-dm text-[13px] text-(--neutral-400)">No data for this range</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={clientsData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    {sharedGrid}
                    {sharedXAxis()}
                    {sharedYAxis((v) => v.toLocaleString())}
                    <Tooltip content={<ChartTooltip format={(v) => v.toLocaleString()} />} cursor={{ fill: "var(--neutral-100)", opacity: 0.4 }} />
                    <Line type="monotone" dataKey="value" stroke="var(--info)" strokeWidth={2.5} dot={false} isAnimationActive animationDuration={700} />
                  </LineChart>
                </ResponsiveContainer>
              );
            })()
          )}
        </div>

        {/* Notifications / Open Tickets / Order Status — one row, three columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={cardClass}>
            <ChartHeader title="Notifications" subtitle="Latest critical alerts" />
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[180px] text-center">
                <AlertTriangle size={28} className="text-(--neutral-300) mb-2" />
                <p className="font-dm text-[13px] text-(--neutral-400)">No critical alerts</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 p-3 rounded-[10px] bg-(--neutral-50) dark:bg-(--dark-bg) border border-(--neutral-100) dark:border-(--dark-border)">
                    <div className="w-2 h-2 rounded-full bg-(--danger) mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">{n.title}</p>
                      <p className="font-dm text-[11px] text-(--neutral-400) mt-0.5 truncate">{n.message ?? ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-(--neutral-100) dark:border-(--dark-border) mt-4 pt-3">
              <Link href="/admin/notifications" className="font-dm text-[13px] text-(--green-600) hover:text-(--green-700) transition-colors">
                View all notifications →
              </Link>
            </div>
          </div>

          <div className={cardClass}>
            <ChartHeader title="Open Tickets" subtitle="Most recently active first" />
            {tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[180px] text-center">
                <Users size={28} className="text-(--neutral-300) mb-2" />
                <p className="font-dm text-[13px] text-(--neutral-400)">No open tickets</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {tickets.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-3 rounded-[10px] bg-(--neutral-50) dark:bg-(--dark-bg) border border-(--neutral-100) dark:border-(--dark-border)">
                    <div className="min-w-0 flex-1">
                      <p className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">{t.subject}</p>
                      <p className="font-dm text-[11px] text-(--neutral-400)">{t.user?.name ?? "Guest"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-dm text-[11px] text-(--neutral-400)">{timeAgo(t.lastActivityAt)}</p>
                      <StatusPill status={t.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-(--neutral-100) dark:border-(--dark-border) mt-4 pt-3">
              <Link href="/admin/support" className="font-dm text-[13px] text-(--green-600) hover:text-(--green-700) transition-colors">
                View all tickets →
              </Link>
            </div>
          </div>

          <div className={cardClass}>
            <ChartHeader title="Order Status" subtitle="Current order breakdown" />
            {isLoading ? (
              <SkeletonChart />
            ) : (dashboard?.ordersByStatus ?? []).length === 0 ? (
              <div className="flex items-center justify-center h-[180px]">
                <p className="font-dm text-[13px] text-(--neutral-400)">No orders yet</p>
              </div>
            ) : (
              (() => {
                const rows = dashboard!.ordersByStatus;
                const total = rows.reduce((s, r) => s + r.count, 0) || 1;
                return (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
                    {rows
                      .sort((a, b) => b.count - a.count)
                      .map((r) => (
                        <div key={r.status} className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: ORDER_STATUS_COLORS[r.status] ?? "var(--neutral-400)" }}
                          />
                          <span className="font-dm text-[12px] text-(--neutral-600) dark:text-(--dark-muted) flex-1 truncate">
                            {r.status}
                          </span>
                          <span className="font-dm text-[12px] font-medium text-(--neutral-900) dark:text-(--dark-text)">
                            {r.count}
                          </span>
                          <span className="font-dm text-[11px] text-(--neutral-400) w-9 text-right">
                            {Math.round((r.count / total) * 100)}%
                          </span>
                        </div>
                      ))}
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* Recent Orders — Full Width */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
              Recent Orders
            </h2>
          </div>
          <DataTable
            columns={orderColumns}
            data={(dashboard?.recentOrders ?? []) as Record<string, unknown>[]}
            loading={isLoading}
            emptyTitle="No orders yet"
            emptyDescription="Orders will appear here once customers start checking out."
            pageSize={8}
          />
        </div>
      </div>
    </div>
  );
}
