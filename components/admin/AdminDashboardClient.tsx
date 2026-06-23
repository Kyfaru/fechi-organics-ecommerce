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

  const dashboard = data?.data;
  const stats = dashboard?.stats;

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
              <StatCard
                eyebrow="Revenue (30d)"
                value={stats ? formatKes(stats.revenue) : "KES 0"}
                icon={TrendingUp}
              />
              <StatCard
                eyebrow="Orders (30d)"
                value={String(stats?.orders ?? 0)}
                icon={ShoppingCart}
              />
              <StatCard
                eyebrow="New Customers"
                value={String(stats?.newCustomers ?? 0)}
                icon={Users}
              />
              <StatCard
                eyebrow="Low Stock Alerts"
                value={String(stats?.lowStock ?? 0)}
                icon={AlertTriangle}
                trend={
                  stats && stats.lowStock > 0
                    ? { value: `${stats.lowStock} products`, positive: false }
                    : undefined
                }
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

          {/* Product Sales — Pie Chart */}
          <div className={cardClass}>
            <ChartHeader title="Product Sales" subtitle="Units sold by product" />
            {analyticsError ? (
              <ChartError />
            ) : analyticsLoading ? (
              <div className="h-[280px] rounded-[10px] bg-(--neutral-100) dark:bg-(--dark-border) animate-pulse" />
            ) : (
              (() => {
                const productSales = analytics?.productSales ?? [];
                return productSales.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center">
                    <p className="font-dm text-[13px] text-(--neutral-400)">
                      No sales data yet
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={productSales}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={2}
                        isAnimationActive
                        animationDuration={700}
                      >
                        {productSales.map((entry, i) => (
                          <Cell
                            key={entry.productId}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                      <Legend
                        formatter={(value: string) => (
                          <span className="font-dm text-[12px] text-(--green-700) dark:text-(--dark-muted)">
                            {truncate(value, 20)}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()
            )}
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

        {/* Row 3: New Clients Line Chart (2/3) + Low Stock List (1/3) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* New Clients — Line Chart */}
          <div className={`xl:col-span-2 ${cardClass}`}>
            <ChartHeader title="New Clients" subtitle="Client registrations" />
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
                  <div className="h-[320px] flex items-center justify-center">
                    <p className="font-dm text-[13px] text-(--neutral-400)">
                      No data for this range
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart
                      data={clientsData}
                      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                    >
                      {sharedGrid}
                      {sharedXAxis()}
                      {sharedYAxis((v) => v.toLocaleString())}
                      <Tooltip
                        content={<ChartTooltip format={(v) => v.toLocaleString()} />}
                        cursor={{ fill: "var(--neutral-100)", opacity: 0.4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--info)"
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive
                        animationDuration={700}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                );
              })()
            )}
          </div>

          {/* Low Stock — List (1/3) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                Low Stock
              </h2>
              <span className="font-dm text-[12px] text-(--danger)">Stock &lt; 10</span>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[60px] rounded-[10px] bg-(--neutral-100) dark:bg-(--dark-border) animate-pulse"
                  />
                ))}
              </div>
            ) : (dashboard?.lowStockProducts ?? []).length === 0 ? (
              <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-8 text-center">
                <p className="font-dm text-[13px] text-(--neutral-400)">
                  All products are adequately stocked.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(dashboard?.lowStockProducts ?? []).map((p) => (
                  <LowStockCard key={p.id} product={p} />
                ))}
              </div>
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
