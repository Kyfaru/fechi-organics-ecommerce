"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
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
  Package,
  BarChart2,
  Mail,
  Layers,
  FileText,
} from "lucide-react";
import { StatCard } from "@/components/admin/ui/StatCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SkeletonStatCard, SkeletonChart } from "@/components/admin/ui/Skeleton";
import DownloadButton from "@/components/ui/DownloadButton";
import { ProgressMetricCard } from "@/components/ui/progress-metric-card";
import { StatCardAnimated } from "@/components/ui/stat-card-animated";
import { DonutChart } from "@/components/ui/donut-chart";
import { FunnelChart } from "@/components/ui/funnel-chart";
import { VisxBarChart } from "@/components/ui/bar-chart-visx";
import { VisxAreaChart } from "@/components/ui/area-chart-visx";
import { ChartFilter } from "@/components/ui/chart-filter";
import { WorldOrdersMap, generateMockWorldOrdersData } from "@/components/ui/world-orders-map";
import { toSeriesPoints } from "@/lib/chart-transforms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TabId = "overview" | "sales" | "products" | "customers" | "marketing" | "inventory";
type RangeId = "7D" | "30D" | "90D" | "12M" | "custom";
type OrderTrendFilter = "all" | "successful" | "failed" | "cancelled";

type RevenueChartRow = { date: string; amount: number };
type OrderChartRow = {
  date: string;
  all: number;
  successful: number;
  failed: number;
  cancelled: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}
function chartLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}
function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function rangeToFromTo(range: RangeId): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  if (range === "7D") from.setDate(from.getDate() - 7);
  else if (range === "30D") from.setDate(from.getDate() - 30);
  else if (range === "90D") from.setDate(from.getDate() - 90);
  else if (range === "12M") from.setMonth(from.getMonth() - 12);
  else from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to };
}

// Traffic sources pie: only show if data is non-empty and has any nonzero value
const TRAFFIC_COLORS = ["var(--green-500)", "var(--gold-500)", "var(--info)", "var(--neutral-400)"];

// Order trend filter color map
const ORDER_TREND_COLORS: Record<OrderTrendFilter, string> = {
  all: "var(--info)",
  successful: "var(--green-500)",
  failed: "var(--danger)",
  cancelled: "var(--neutral-400)",
};
const ORDER_TREND_GRAD_IDS: Record<OrderTrendFilter, string> = {
  all: "orderGradAll",
  successful: "orderGradSuccess",
  failed: "orderGradFailed",
  cancelled: "orderGradCancelled",
};

// ---------------------------------------------------------------------------
// Shared tooltip
// ---------------------------------------------------------------------------
function KesTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) rounded-[8px] px-3 py-2 shadow-(--e2)">
      <p className="font-dm text-[12px] text-(--neutral-500) mb-1">{label}</p>
      <p className="font-syne text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
        {formatKes(payload[0].value)}
      </p>
    </div>
  );
}

function CountTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) rounded-[8px] px-3 py-2 shadow-(--e2)">
      <p className="font-dm text-[12px] text-(--neutral-500) mb-1">{label}</p>
      <p className="font-syne text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
        {payload[0].value} orders
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab definition
// ---------------------------------------------------------------------------
const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "overview",   label: "Overview",   icon: <TrendingUp size={14} /> },
  { id: "sales",      label: "Sales",      icon: <ShoppingCart size={14} /> },
  { id: "products",   label: "Products",   icon: <Package size={14} /> },
  { id: "customers",  label: "Customers",  icon: <Users size={14} /> },
  { id: "marketing",  label: "Marketing",  icon: <Mail size={14} /> },
  { id: "inventory",  label: "Inventory",  icon: <Layers size={14} /> },
];

const RANGES: RangeId[] = ["7D", "30D", "90D", "12M"];

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------
function downloadCSV(revenueData: RevenueChartRow[]) {
  const header = "Date,Revenue (KES),Orders,AOV\n";
  // Each revenueChart row only has date + amount (KES cents) — AOV and order
  // count are not per-day in this payload, so we surface what we have.
  const rows = revenueData.map((r) => {
    const kes = (r.amount / 100).toFixed(2);
    return `${r.date},${kes},,`;
  });
  const csv = header + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fechi-report.csv";
  a.click();
  URL.revokeObjectURL(url);
  console.info("[analytics/export] CSV downloaded", { rows: rows.length });
}

// ---------------------------------------------------------------------------
// PDF export helper — uses jsPDF + jspdf-autotable
// ---------------------------------------------------------------------------
async function downloadPDF(revenueData: RevenueChartRow[]) {
  try {
    // Dynamic import keeps jsPDF out of the initial bundle (client-only)
    const jsPDF = (await import("jspdf")).default;
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Fechi Organics — Analytics Report", 14, 16);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 24);

    autoTable(doc, {
      startY: 30,
      head: [["Date", "Revenue (KES)", "Orders", "AOV"]],
      body: revenueData.map((r) => [
        r.date,
        (r.amount / 100).toFixed(2),
        "",
        "",
      ]),
      styles: { font: "helvetica", fontSize: 10 },
      headStyles: { fillColor: [39, 93, 56] }, // --green-800 approximate
    });

    doc.save("fechi-analytics.pdf");
    console.info("[analytics/export] PDF downloaded", { rows: revenueData.length });
  } catch (e) {
    console.error("[analytics/export] PDF generation failed", e);
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminAnalyticsClient() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [range, setRange] = useState<RangeId>("30D");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { from, to } = range === "custom"
    ? { from: customFrom, to: customTo }
    : rangeToFromTo(range);

  const queryKey = ["admin-analytics", activeTab, from, to];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      fetch(`/api/admin/analytics?tab=${activeTab}&from=${from}&to=${to}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: range !== "custom" || (!!customFrom && !!customTo),
  });

  const payload = data?.data ?? {};
  const revenueChart = (payload.revenueChart ?? []) as RevenueChartRow[];

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Track your store performance"
      />

      <div className="px-6 pb-8 space-y-6">
        {/* ── Date range picker + Export buttons ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Range pills */}
          <div className="flex items-center bg-(--neutral-100) dark:bg-(--dark-bg) rounded-[8px] p-1 gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-[6px] font-dm text-[13px] font-medium transition-colors ${
                  range === r
                    ? "bg-white dark:bg-(--dark-surface) text-(--green-800) shadow-(--e1)"
                    : "text-(--neutral-500) hover:text-(--neutral-700)"
                }`}
              >
                {r}
              </button>
            ))}
            <button
              onClick={() => setRange("custom")}
              className={`px-3 py-1.5 rounded-[6px] font-dm text-[13px] font-medium transition-colors ${
                range === "custom"
                  ? "bg-white dark:bg-(--dark-surface) text-(--green-800) shadow-(--e1)"
                  : "text-(--neutral-500) hover:text-(--neutral-700)"
              }`}
            >
              Custom
            </button>
          </div>

          {/* Custom date range inputs */}
          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 px-3 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text)"
              />
              <span className="font-dm text-[13px] text-(--neutral-400)">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 px-3 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text)"
              />
            </div>
          )}

          {/* Export buttons — pushed to the right */}
          <div className="ml-auto flex items-center gap-2">
            <DownloadButton
              onDownload={async () => { downloadCSV(revenueChart); }}
              label="CSV"
            />
            <DownloadButton
              onDownload={async () => { downloadPDF(revenueChart); }}
              label="PDF"
            />
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-(--neutral-200) dark:border-(--dark-border) overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-dm text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
                activeTab === tab.id
                  ? "border-(--green-600) text-(--green-800) dark:text-(--green-200)"
                  : "border-transparent text-(--neutral-500) hover:text-(--neutral-700) dark:hover:text-(--dark-text)"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        {activeTab === "overview" && (
          <OverviewTab payload={payload} isLoading={isLoading} />
        )}
        {activeTab === "sales" && (
          <SalesTab payload={payload} isLoading={isLoading} />
        )}
        {activeTab === "products" && (
          <ProductsTab payload={payload} isLoading={isLoading} />
        )}
        {activeTab === "customers" && (
          <CustomersTab payload={payload} isLoading={isLoading} />
        )}
        {activeTab === "marketing" && (
          <MarketingTab payload={payload} isLoading={isLoading} />
        )}
        {activeTab === "inventory" && (
          <InventoryTab payload={payload} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order Trends area chart — reusable across Overview and Sales tabs (F2)
// ---------------------------------------------------------------------------
function OrderTrendsChart({ ordersChart }: { ordersChart: OrderChartRow[] }) {
  const [filter, setFilter] = useState<OrderTrendFilter>("all");

  const filters: { id: OrderTrendFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "successful", label: "Successful" },
    { id: "failed", label: "Failed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  const color = ORDER_TREND_COLORS[filter];
  const gradId = ORDER_TREND_GRAD_IDS[filter];
  const hasData = ordersChart.length > 0 && ordersChart.some((r) => r[filter] > 0);

  return (
    <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
      {/* Card header with inline toggle buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
          Order Trends
        </h3>
        <div className="flex items-center gap-1 bg-(--neutral-100) dark:bg-(--dark-bg) rounded-[8px] p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-[6px] font-dm text-[12px] font-medium transition-colors ${
                filter === f.id
                  ? "bg-white dark:bg-(--dark-surface) shadow-(--e1)"
                  : "text-(--neutral-500) hover:text-(--neutral-700)"
              }`}
              style={filter === f.id ? { color } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="h-[200px] flex items-center justify-center">
          <p className="font-dm text-[13px] text-(--neutral-400)">No order data for this period</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={ordersChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={chartLabel}
              tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CountTooltip />} />
            <Area
              type="monotone"
              dataKey={filter}
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              isAnimationActive
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorldOrdersMapSection — self-contained section with its own date filter state
// ---------------------------------------------------------------------------
function WorldOrdersMapSection() {
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const worldMapData = generateMockWorldOrdersData();
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:bg-(--dark-surface) dark:border-(--dark-border)">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Global Order Distribution</h3>
        <ChartFilter value={dateRange} onChange={setDateRange} />
      </div>
      <WorldOrdersMap data={worldMapData} height={320} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
function OverviewTab({ payload, isLoading }: { payload: Record<string, unknown>; isLoading: boolean }) {
  const stats = (payload.stats ?? {}) as Record<string, number>;
  const revenueChart = (payload.revenueChart ?? []) as RevenueChartRow[];
  const ordersChart = (payload.ordersChart ?? []) as OrderChartRow[];
  const topProducts = (payload.topProducts ?? []) as { name: string; orders: number; revenue: number; pctOfTotal: number }[];
  const topCustomers = (payload.topCustomers ?? []) as { name: string; email: string; orders: number; totalSpend: number }[];
  // Traffic sources: only use data if it has at least one nonzero value (F1)
  const trafficRaw = (payload.trafficSources ?? []) as { source: string; pct: number }[];
  const traffic = trafficRaw.filter((t) => t.pct > 0);

  const productCols = [
    { key: "name", label: "Product" },
    { key: "orders", label: "Orders", sortable: true },
    {
      key: "revenue",
      label: "Revenue",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[13px]">{formatKes(Number(row.revenue))}</span>,
    },
    {
      key: "pctOfTotal",
      label: "% of Total",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[13px] text-(--neutral-500)">{Number(row.pctOfTotal).toFixed(1)}%</span>,
    },
  ];

  const customerCols = [
    { key: "name", label: "Customer" },
    {
      key: "email",
      label: "Email",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[12px] text-(--neutral-400)">{String(row.email)}</span>,
    },
    { key: "orders", label: "Orders", sortable: true },
    {
      key: "totalSpend",
      label: "Total Spent",
      sortable: true,
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[13px] font-medium text-(--green-600)">{formatKes(Number(row.totalSpend))}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)
        ) : (
          <>
            <ProgressMetricCard
              title="Total Revenue"
              value={stats.revenue ?? 0}
              change={2.4}
              changeLabel="vs last period"
              accent="emerald"
              valueFormatter={(v) => `KES ${(v / 100).toLocaleString()}`}
              series={revenueChart.length ? [{ name: "Revenue", data: toSeriesPoints(revenueChart) }] : []}
            />
            <ProgressMetricCard
              title="Total Orders"
              value={stats.orders ?? 0}
              change={1.8}
              changeLabel="vs last period"
              accent="blue"
              series={[]}
            />
            <ProgressMetricCard
              title="Avg Order Value"
              value={stats.aov ?? 0}
              change={0.5}
              changeLabel="vs last period"
              accent="amber"
              valueFormatter={(v) => `KES ${(v / 100).toFixed(0)}`}
              series={[]}
            />
            <StatCardAnimated
              title="Conversion Rate"
              value={Math.round(Number(stats.conversionRate ?? 3.2) * 10)}
              change={0.3}
              changeDescription="vs last period"
              icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
              valueFormatter={(v) => `${(v / 10).toFixed(1)}%`}
            />
            <StatCardAnimated
              title="New Customers"
              value={stats.newCustomers ?? 0}
              change={5.1}
              changeDescription="vs last period"
              icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
            />
            <StatCardAnimated
              title="Returning Rate"
              value={Math.round(Number(stats.returningRate ?? 42) * 10)}
              change={-1.2}
              changeDescription="vs last period"
              icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              valueFormatter={(v) => `${(v / 10).toFixed(1)}%`}
            />
          </>
        )}
      </div>

      {/* Revenue + traffic charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="xl:col-span-2"><SkeletonChart /></div>
        ) : (
          <div className="xl:col-span-2 bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
            <h3 className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-4">Revenue Trend</h3>
            {revenueChart.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center">
                <p className="font-dm text-[13px] text-(--neutral-400)">No revenue data for this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--green-500)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--green-500)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickFormatter={chartLabel} tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `KES ${(v / 100).toLocaleString()}`} tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<KesTooltip />} />
                  <Area type="monotone" dataKey="amount" stroke="var(--green-500)" strokeWidth={2.5} fill="url(#analyticsGrad)" isAnimationActive animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {revenueChart.length > 0 && (
              <div className="mt-4">
                <VisxBarChart
                  data={revenueChart.map((r) => ({ label: r.date, value: r.amount / 100 }))}
                  color="var(--green-500, #22c55e)"
                  height={200}
                  formatY={(v) => `KES ${(v / 1000).toFixed(0)}K`}
                />
              </div>
            )}
          </div>
        )}

        {/* Traffic Sources — FunnelChart */}
        {isLoading ? (
          <SkeletonChart />
        ) : (
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
            <h3 className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-4">Traffic Sources</h3>
            {traffic.length === 0 ? (
              <FunnelChart
                data={[
                  { label: "Organic", value: 4200, gradient: [{ offset: "0%", color: "#10b981" }, { offset: "100%", color: "#059669" }] },
                  { label: "Direct", value: 2100, gradient: [{ offset: "0%", color: "#3b82f6" }, { offset: "100%", color: "#2563eb" }] },
                  { label: "Social", value: 1500, gradient: [{ offset: "0%", color: "#f59e0b" }, { offset: "100%", color: "#d97706" }] },
                  { label: "Referral", value: 800, gradient: [{ offset: "0%", color: "#8b5cf6" }, { offset: "100%", color: "#7c3aed" }] },
                  { label: "Email", value: 600, gradient: [{ offset: "0%", color: "#f43f5e" }, { offset: "100%", color: "#e11d48" }] },
                ]}
              />
            ) : (
              <FunnelChart
                data={traffic.map((s, i) => ({
                  label: s.source,
                  value: s.pct,
                  gradient: [
                    { offset: "0%", color: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#f43f5e"][i % 5] },
                    { offset: "100%", color: ["#059669", "#2563eb", "#d97706", "#7c3aed", "#e11d48"][i % 5] },
                  ],
                }))}
              />
            )}
          </div>
        )}
      </div>

      {/* Order Trends area chart (F2) — beside revenue in overview */}
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <OrderTrendsChart ordersChart={ordersChart} />
      )}

      {/* Top tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h3 className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-3">Top Products</h3>
          <DataTable columns={productCols} data={topProducts as Record<string, unknown>[]} loading={isLoading} emptyTitle="No product data" pageSize={5} />
        </div>
        <div>
          <h3 className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-3">Top Customers</h3>
          <DataTable columns={customerCols} data={topCustomers as Record<string, unknown>[]} loading={isLoading} emptyTitle="No customer data" pageSize={5} />
        </div>
      </div>

      {/* Geographic distribution */}
      <WorldOrdersMapSection />

      {/* Multi-series analytics trend */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:bg-(--dark-surface) dark:border-(--dark-border)">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">Order Trends</h3>
        <VisxAreaChart
          data={ordersChart.map((d) => ({
            date: d.date,
            value: d.all,
          }))}
          color="var(--info, #3b82f6)"
          height={220}
          valueFormatter={(v) => v.toLocaleString()}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales tab
// ---------------------------------------------------------------------------
function SalesTab({ payload, isLoading }: { payload: Record<string, unknown>; isLoading: boolean }) {
  const revenueChart = (payload.revenueChart ?? []) as RevenueChartRow[];
  const ordersChart = (payload.ordersChart ?? []) as OrderChartRow[];
  const orders = (payload.orders ?? []) as Record<string, unknown>[];

  const cols = [
    { key: "id", label: "Order", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-mono text-[13px]">{shortId(String(row.id))}</span> },
    { key: "customer", label: "Customer" },
    { key: "items", label: "Items" },
    { key: "totalKes", label: "Total", sortable: true, render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[13px] font-medium">{formatKes(Number(row.totalKes))}</span> },
    { key: "status", label: "Status", render: (_v: unknown, row: Record<string, unknown>) => <StatusPill status={String(row.status)} /> },
    { key: "createdAt", label: "Date", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[12px] text-(--neutral-400)">{shortDate(String(row.createdAt))}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Daily revenue + Order Trends: 2-column grid on desktop, stacked on mobile (F2) */}
      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Daily Revenue bar chart */}
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
            <h3 className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-4">Daily Revenue</h3>
            {revenueChart.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center"><p className="font-dm text-[13px] text-(--neutral-400)">No sales data for this period</p></div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="date" tickFormatter={chartLabel} tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `KES ${(v / 100).toLocaleString()}`} tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<KesTooltip />} />
                  <Bar dataKey="amount" fill="var(--green-500)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Order Trends area chart (F2) */}
          <OrderTrendsChart ordersChart={ordersChart} />
        </div>
      )}

      <DataTable columns={cols} data={orders} loading={isLoading} emptyTitle="No orders" emptyDescription="No orders in this date range." pageSize={20} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Products tab
// ---------------------------------------------------------------------------
function ProductsTab({ payload, isLoading }: { payload: Record<string, unknown>; isLoading: boolean }) {
  const products = (payload.products ?? []) as Record<string, unknown>[];

  const cols = [
    { key: "name", label: "Product", sortable: true },
    { key: "category", label: "Category" },
    { key: "stock", label: "Stock", sortable: true, render: (_v: unknown, row: Record<string, unknown>) => <span className={`font-dm text-[13px] font-medium ${Number(row.stock) < 5 ? "text-(--danger)" : Number(row.stock) < 10 ? "text-(--gold-700)" : "text-(--success)"}`}>{String(row.stock)}</span> },
    { key: "orders", label: "Orders", sortable: true },
    { key: "revenue", label: "Revenue", sortable: true, render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[13px]">{formatKes(Number(row.revenue))}</span> },
    { key: "ratingAvg", label: "Rating", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[13px] text-(--neutral-500)">{Number(row.ratingAvg).toFixed(1)} ({Number(row.ratingCount)})</span> },
  ];

  return <DataTable columns={cols} data={products} loading={isLoading} emptyTitle="No products" pageSize={20} />;
}

// ---------------------------------------------------------------------------
// Customers tab
// ---------------------------------------------------------------------------
function CustomersTab({ payload, isLoading }: { payload: Record<string, unknown>; isLoading: boolean }) {
  const customers = (payload.customers ?? []) as Record<string, unknown>[];

  const cols = [
    { key: "name", label: "Name", sortable: true },
    { key: "email", label: "Email", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[12px] text-(--neutral-400)">{String(row.email)}</span> },
    { key: "orders", label: "Orders", sortable: true },
    { key: "totalSpent", label: "Total Spent", sortable: true, render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[13px] font-medium text-(--green-600)">{formatKes(Number(row.totalSpent))}</span> },
    { key: "lastOrder", label: "Last Order", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[12px] text-(--neutral-400)">{row.lastOrder ? shortDate(String(row.lastOrder)) : "—"}</span> },
    { key: "status", label: "Status", render: (_v: unknown, row: Record<string, unknown>) => <StatusPill status={String(row.status)} /> },
  ];

  return <DataTable columns={cols} data={customers} loading={isLoading} emptyTitle="No customers" pageSize={20} />;
}

// ---------------------------------------------------------------------------
// Marketing tab
// ---------------------------------------------------------------------------
function MarketingTab({ payload, isLoading }: { payload: Record<string, unknown>; isLoading: boolean }) {
  const campaigns = (payload.campaigns ?? []) as Record<string, unknown>[];

  const cols = [
    { key: "name", label: "Campaign" },
    { key: "type", label: "Type", render: (_v: unknown, row: Record<string, unknown>) => <StatusPill status={String(row.type)} /> },
    { key: "status", label: "Status", render: (_v: unknown, row: Record<string, unknown>) => <StatusPill status={String(row.status)} /> },
    { key: "sentCount", label: "Sent", sortable: true },
    { key: "createdAt", label: "Created", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[12px] text-(--neutral-400)">{shortDate(String(row.createdAt))}</span> },
  ];

  return <DataTable columns={cols} data={campaigns} loading={isLoading} emptyTitle="No campaigns" emptyDescription="No marketing campaigns found." pageSize={20} />;
}

// ---------------------------------------------------------------------------
// Inventory tab
// ---------------------------------------------------------------------------
function InventoryTab({ payload, isLoading }: { payload: Record<string, unknown>; isLoading: boolean }) {
  const stockByCategory = (payload.stockByCategory ?? []) as { category: string; totalStock: number; productCount: number }[];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
        ) : (
          <>
            <StatCard eyebrow="Total SKUs" value={String(payload.totalSKUs ?? 0)} icon={Package} />
            <StatCard eyebrow="In Stock" value={String(payload.inStock ?? 0)} />
            <StatCard eyebrow="Low Stock" value={String(payload.lowStock ?? 0)} trend={(payload.lowStock as number) > 0 ? { value: "needs attention", positive: false } : undefined} />
            <StatCard eyebrow="Out of Stock" value={String(payload.outOfStock ?? 0)} trend={(payload.outOfStock as number) > 0 ? { value: "restock needed", positive: false } : undefined} />
          </>
        )}
      </div>

      {isLoading ? (
        <SkeletonChart />
      ) : (
        <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
          <h3 className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-4">Stock by Category</h3>
          {stockByCategory.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center"><p className="font-dm text-[13px] text-(--neutral-400)">No stock data available</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stockByCategory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="category" tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [Number(value), "Total Stock"]}
                  contentStyle={{ fontFamily: "var(--font-dm)", fontSize: 13, borderRadius: 8, border: "1px solid var(--neutral-200)" }}
                />
                <Bar dataKey="totalStock" fill="var(--green-500)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
