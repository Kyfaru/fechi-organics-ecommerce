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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  ShoppingCart,
  Users,
  AlertTriangle,
  Package,
} from "lucide-react";
import { StatCard } from "@/components/admin/ui/StatCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SkeletonStatCard, SkeletonChart } from "@/components/admin/ui/Skeleton";
import { ProgressMetricCard } from "@/components/ui/progress-metric-card";
import { StatsWidget } from "@/components/ui/stats-widget";
import { DonutChart, type DonutChartSegment } from "@/components/ui/donut-chart";
import { VisxBarChart } from "@/components/ui/bar-chart-visx";
import { VisxAreaChart } from "@/components/ui/area-chart-visx";
import { RechartsAreaChart } from "@/components/ui/area-chart-recharts";
import { ChartFilter } from "@/components/ui/chart-filter";
import { Badge2 } from "@/components/ui/badge-2";
import { toSeriesPoints } from "@/lib/chart-transforms";

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

type LowStockProduct = {
  id: string;
  name: string;
  stock: number;
  images: { objectKey: string; isPrimary: boolean }[];
};

type DashboardData = {
  stats: { revenue: number; orders: number; newCustomers: number; lowStock: number };
  recentOrders: RecentOrder[];
  lowStockProducts: LowStockProduct[];
};

type AnalyticsData = {
  granularity: "hourly" | "daily" | "weekly" | "monthly";
  buckets: string[];
  series: { orders: number[]; revenue: number[]; clients: number[] };
  productSales: { productId: string; name: string; value: number; percent: number }[];
};

type AnalyticsPoint = { label: string; value: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RANGES = ["24h", "7d", "14d", "30d", "3m", "6m", "12m", "All"] as const;
type RangeKey = typeof RANGES[number] | "custom";

const PIE_COLORS = [
  "#43A935",
  "#FFC800",
  "#3B82C4",
  "#F97316",
  "#D64545",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F59E0B",
  "#6366F1",
];

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

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: AnalyticsData["productSales"][number] }[];
}) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) rounded-[8px] px-3 py-2 shadow-(--e2)">
      <p className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text)">
        {slice.name} &mdash; {slice.percent}%
      </p>
    </div>
  );
}

function LowStockCard({ product }: { product: LowStockProduct }) {
  const primary = product.images.find((i) => i.isPrimary) ?? product.images[0];
  const imageUrl = primary
    ? `https://pub-fechi.b-cdn.net/${primary.objectKey}`
    : null;

  return (
    <div className="bg-white dark:bg-(--dark-surface) rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-4 flex items-center gap-3">
      <div className="w-12 h-12 rounded-[8px] bg-(--neutral-100) dark:bg-(--dark-bg) flex-shrink-0 overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={20} className="text-(--neutral-300)" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">
          {product.name}
        </p>
        <p
          className={`font-dm text-[12px] font-semibold mt-0.5 ${
            product.stock < 5 ? "text-(--danger)" : "text-(--gold-700)"
          }`}
        >
          {product.stock} in stock
        </p>
      </div>
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

// ---------------------------------------------------------------------------
// Range pill class helper
// ---------------------------------------------------------------------------
function rangePillClass(active: boolean) {
  return active
    ? "bg-(--green-800) text-white dark:bg-(--dark-accent) dark:text-(--dark-bg) rounded-full px-3 h-8 font-dm text-[13px] font-medium transition-colors flex items-center"
    : "bg-transparent text-(--neutral-500) dark:text-(--dark-muted) hover:bg-(--green-50) dark:hover:bg-(--dark-border) rounded-full px-3 h-8 font-dm text-[13px] font-medium transition-colors flex items-center";
}

// ---------------------------------------------------------------------------
// Card class (used inline via template literals)
// ---------------------------------------------------------------------------
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
    queryKey: ["admin-tickets-waiting"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/tickets?sort=waiting&limit=5");
        if (!res.ok) return { tickets: [] };
        return res.json();
      } catch { return { tickets: [] }; }
    },
    staleTime: 60_000,
  });
  const tickets: Array<{ id: string; subject: string; customerName: string; waitTime: string; priority: string }> = ticketsData?.data?.tickets ?? ticketsData?.tickets ?? [];

  const { data: criticalNotifs } = useQuery({
    queryKey: ["admin-notifications-critical"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/notifications?limit=5&type=error");
        if (!res.ok) return { notifications: [] };
        return res.json();
      } catch { return { notifications: [] }; }
    },
    staleTime: 30_000,
  });
  const notifications: Array<{ id: string; title: string; message: string; type: string; createdAt: string }> = criticalNotifs?.data?.notifications ?? criticalNotifs?.notifications ?? [];

  const dashboard = data?.data;
  const stats = dashboard?.stats;

  // Build a monthlyRevenue-shaped array from analytics buckets for chart helpers
  const monthlyRevenue: { month: string; amount: number }[] = analytics
    ? analytics.buckets.map((b, i) => ({ month: b, amount: analytics.series.revenue[i] ?? 0 }))
    : [];

  // Order status donut data - calculate from recentOrders
  const statusCounts = (dashboard?.recentOrders ?? []).reduce(
    (acc: Record<string, number>, o: { status: string }) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const orderStatusData: DonutChartSegment[] = [
    { label: "Delivered", value: (stats as unknown as Record<string, number>)?.delivered ?? statusCounts["delivered"] ?? 0, color: "var(--green-500, #22c55e)" },
    { label: "Shipped", value: (stats as unknown as Record<string, number>)?.shipped ?? statusCounts["shipped"] ?? 0, color: "var(--info, #3b82f6)" },
    { label: "Processing", value: (stats as unknown as Record<string, number>)?.processing ?? statusCounts["processing"] ?? 0, color: "var(--gold-500, #eab308)" },
    { label: "Pending", value: (stats as unknown as Record<string, number>)?.pending ?? statusCounts["pending"] ?? 0, color: "var(--neutral-400, #9ca3af)" },
    { label: "Cancelled", value: (stats as unknown as Record<string, number>)?.cancelled ?? statusCounts["cancelled"] ?? 0, color: "var(--danger, #ef4444)" },
  ];

  const [chartDateRange, setChartDateRange] = useState<{ start: string; end: string } | null>(null);

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
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          ) : (
            <>
              <ProgressMetricCard
                title="Total Revenue"
                value={stats?.revenue ?? 0}
                change={2.4}
                changeLabel="vs last month"
                accent="emerald"
                valueFormatter={(v) => `KES ${(v / 100).toLocaleString()}`}
                series={monthlyRevenue.length ? [{ name: "Revenue", data: toSeriesPoints(monthlyRevenue) }] : []}
              />
              <ProgressMetricCard
                title="Total Orders"
                value={stats?.orders ?? 0}
                change={1.8}
                changeLabel="vs last month"
                accent="blue"
                series={[]}
              />
              <StatsWidget
                title="New Customers"
                metric={String(stats?.newCustomers ?? 0)}
                change={3.2}
                changeLabel="vs last month"
                color="green"
              />
              <StatsWidget
                title="Low Stock Alerts"
                metric={String(stats?.lowStock ?? 0)}
                change={-5.1}
                changeLabel="vs last month"
                color="danger"
              />
            </>
          )}
        </div>

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

        {/* Row 1: Orders Bar Chart (2/3) + Product Sales Pie (1/3) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Orders — Bar Chart */}
          <div className={`xl:col-span-2 ${cardClass}`}>
            <ChartHeader
              title="Orders"
              subtitle={
                analytics
                  ? `Order count per ${analytics.granularity} period`
                  : "Order count"
              }
            />
            {analyticsError ? (
              <ChartError />
            ) : analyticsLoading ? (
              <SkeletonChart />
            ) : (
              (() => {
                const ordersData: AnalyticsPoint[] = analytics
                  ? analytics.buckets.map((b, i) => ({
                      label: b,
                      value: analytics.series.orders[i] ?? 0,
                    }))
                  : [];
                return ordersData.length === 0 ? (
                  <div className="h-[320px] flex items-center justify-center">
                    <p className="font-dm text-[13px] text-(--neutral-400)">
                      No data for this range
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={ordersData}
                      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                    >
                      {sharedGrid}
                      {sharedXAxis()}
                      {sharedYAxis((v) => v.toLocaleString())}
                      <Tooltip
                        content={<ChartTooltip format={(v) => v.toLocaleString()} />}
                        cursor={{ fill: "var(--neutral-100)", opacity: 0.4 }}
                      />
                      <Bar
                        dataKey="value"
                        fill="var(--green-500)"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive
                        animationDuration={700}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()
            )}
          </div>

          {/* Notifications — Critical alerts */}
          <div className={cardClass}>
            <ChartHeader title="Notifications" subtitle="Latest critical alerts" />
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[220px] text-center">
                <AlertTriangle size={32} className="text-(--neutral-300) mb-2" />
                <p className="font-dm text-[13px] text-(--neutral-400)">No critical alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
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
        </div>


        {/* Row 2: Revenue Area Chart — Full Width */}
        <div className={cardClass}>
          <ChartHeader title="Revenue" subtitle="KES from paid orders" />
          {analyticsError ? (
            <ChartError />
          ) : analyticsLoading ? (
            <SkeletonChart />
          ) : (
            (() => {
              const revenueData: AnalyticsPoint[] = analytics
                ? analytics.buckets.map((b, i) => ({
                    label: b,
                    value: analytics.series.revenue[i] ?? 0,
                  }))
                : [];
              return revenueData.length === 0 ? (
                <div className="h-[320px] flex items-center justify-center">
                  <p className="font-dm text-[13px] text-(--neutral-400)">
                    No data for this range
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart
                    data={revenueData}
                    margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--green-500)"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--green-500)"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    {sharedGrid}
                    {sharedXAxis()}
                    {sharedYAxis(
                      (v) => `KES ${(v / 100).toLocaleString()}`,
                      80,
                    )}
                    <Tooltip
                      content={
                        <ChartTooltip
                          format={(v) => `KES ${(v / 100).toLocaleString()}`}
                        />
                      }
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

        {/* Row 3: Customer Tickets (1/3) + Order Status DonutChart (2/3) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Customer Tickets — longest waiting */}
          <div className={cardClass}>
            <ChartHeader title="Open Tickets" subtitle="Longest waiting first" />
            {tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[220px] text-center">
                <Users size={32} className="text-(--neutral-300) mb-2" />
                <p className="font-dm text-[13px] text-(--neutral-400)">No open tickets</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-3 rounded-[10px] bg-(--neutral-50) dark:bg-(--dark-bg) border border-(--neutral-100) dark:border-(--dark-border)">
                    <div className="min-w-0 flex-1">
                      <p className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">{t.subject}</p>
                      <p className="font-dm text-[11px] text-(--neutral-400)">{t.customerName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-dm text-[11px] text-(--neutral-400)">{t.waitTime}</p>
                      <Badge2
                        variant={t.priority === "urgent" ? "destructive" : t.priority === "high" ? "warning" : "outline"}
                        size="xs"
                        className="mt-0.5"
                      >
                        {t.priority}
                      </Badge2>
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

          {/* Order Status — DonutChart (2/3) */}
          <div className={`xl:col-span-2 ${cardClass}`}>
            <ChartHeader title="Order Status" subtitle="Distribution of current orders" />
            {isLoading ? (
              <SkeletonChart />
            ) : (
              <div className="flex flex-col items-center justify-center gap-6">
                <DonutChart
                  data={[
                    { label: "Delivered", value: statusCounts["DELIVERED"] ?? 0, color: "var(--green-500)" },
                    { label: "Shipped", value: statusCounts["SHIPPED"] ?? 0, color: "var(--info)" },
                    { label: "Processing", value: statusCounts["PROCESSING"] ?? 0, color: "var(--gold-500)" },
                    { label: "Confirmed", value: statusCounts["CONFIRMED"] ?? 0, color: "#8B5CF6" },
                    { label: "Pending", value: statusCounts["PENDING"] ?? 0, color: "var(--neutral-400)" },
                    { label: "Cancelled", value: statusCounts["CANCELLED"] ?? 0, color: "var(--danger)" },
                  ].filter((d) => d.value > 0)}
                  size={260}
                  strokeWidth={32}
                  centerContent={
                    <div className="text-center">
                      <p className="font-syne text-[28px] font-bold text-(--neutral-900) dark:text-(--dark-text)">
                        {(dashboard?.recentOrders ?? []).length}
                      </p>
                      <p className="font-dm text-[12px] text-(--neutral-400)">Orders</p>
                    </div>
                  }
                />
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                  {[
                    { label: "Delivered", color: "var(--green-500)" },
                    { label: "Shipped", color: "var(--info)" },
                    { label: "Processing", color: "var(--gold-500)" },
                    { label: "Confirmed", color: "#8B5CF6" },
                    { label: "Pending", color: "var(--neutral-400)" },
                    { label: "Cancelled", color: "var(--danger)" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted)">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row 4: New Clients Line Chart — Full Width */}
        <div className={cardClass}>
          <ChartHeader title="New Clients" subtitle="Client registrations over time" />
          {analyticsError ? (
            <ChartError />
          ) : analyticsLoading ? (
            <SkeletonChart />
          ) : (
            (() => {
              const clientsData: AnalyticsPoint[] = analytics
                ? analytics.buckets.map((b, i) => ({
                    label: b,
                    value: analytics.series.clients[i] ?? 0,
                  }))
                : [];
              return clientsData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center">
                  <p className="font-dm text-[13px] text-(--neutral-400)">No data for this range</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
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

        {/* New chart rows */}
        <div className="mt-6 space-y-6">
          {/* Row A: Bar chart + Notifications */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">Monthly Revenue</h3>
                <VisxBarChart
                  data={monthlyRevenue.map((r) => ({ label: r.month, value: r.amount / 100 }))}
                  color="var(--green-500, #22c55e)"
                  height={200}
                  formatY={(v) => `KES ${(v / 1000).toFixed(0)}K`}
                />
              </div>
            </div>
            <div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Notifications</h3>
                  <Badge2 variant="destructive" size="xs">{notifications.length}</Badge2>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-sm text-neutral-400 text-center py-8">No critical notifications</p>
                ) : (
                  <div className="space-y-2">
                    {notifications.map((n) => (
                      <div key={n.id} className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-2.5">
                        <p className="text-xs font-medium text-red-800 dark:text-red-400 truncate">{n.title}</p>
                        <p className="text-xs text-red-600 dark:text-red-500 truncate mt-0.5">{n.message}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-neutral-100 dark:border-dark-border mt-3 pt-3">
                  <a href="/admin/notifications" className="text-xs text-green-600 hover:text-green-700 dark:text-green-400">View all notifications →</a>
                </div>
              </div>
            </div>
          </div>

          {/* Row B: Customer Tickets + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border h-full">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">Customer Tickets</h3>
                {tickets.length === 0 ? (
                  <p className="text-sm text-neutral-400 text-center py-8">No open tickets</p>
                ) : (
                  <div className="space-y-2">
                    {tickets.map((ticket) => (
                      <div key={ticket.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate text-neutral-800 dark:text-neutral-200">{ticket.subject}</p>
                          <p className="text-xs text-neutral-400">{ticket.customerName}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-neutral-400">{ticket.waitTime}</span>
                          <Badge2 variant={ticket.priority === "urgent" ? "destructive" : ticket.priority === "high" ? "warning" : "outline"} size="xs">
                            {ticket.priority}
                          </Badge2>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-neutral-100 dark:border-dark-border mt-3 pt-3">
                  <a href="/admin/support" className="text-xs text-green-600 hover:text-green-700 dark:text-green-400">View all tickets →</a>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">Order Status Distribution</h3>
                <div className="flex justify-center">
                  <DonutChart
                    data={orderStatusData.filter((d) => d.value > 0)}
                    size={220}
                    strokeWidth={32}
                    valueFormatter={(v) => v.toLocaleString()}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Row C: Revenue Trend with date filter */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:bg-dark-surface dark:border-dark-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Revenue Trend</h3>
              <ChartFilter value={chartDateRange} onChange={setChartDateRange} />
            </div>
            <VisxAreaChart
              data={monthlyRevenue.map((r) => ({ date: r.month, value: r.amount / 100 }))}
              color="var(--green-500, #22c55e)"
              height={220}
              valueFormatter={(v) => `KES ${(v / 1000).toFixed(0)}K`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
