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
} from "lucide-react";
import { StatCard } from "@/components/admin/ui/StatCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SkeletonStatCard, SkeletonChart } from "@/components/admin/ui/Skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TabId = "overview" | "sales" | "products" | "customers" | "marketing" | "inventory";
type RangeId = "7D" | "30D" | "90D" | "12M" | "custom";

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

const TRAFFIC_COLORS = ["var(--green-500)", "var(--gold-500)", "var(--info)", "var(--neutral-400)"];

// ---------------------------------------------------------------------------
// Shared tooltip
// ---------------------------------------------------------------------------
function KesTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[--dark-surface] border border-[--neutral-200] dark:border-[--dark-border] rounded-[8px] px-3 py-2 shadow-[--e2]">
      <p className="font-dm text-[12px] text-[--neutral-500] mb-1">{label}</p>
      <p className="font-syne text-[13px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">
        {formatKes(payload[0].value)}
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

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Track your store performance"
      />

      <div className="px-6 pb-8 space-y-6">
        {/* ── Date range picker ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-[--neutral-100] dark:bg-[--dark-bg] rounded-[8px] p-1 gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-[6px] font-dm text-[13px] font-medium transition-colors ${
                  range === r
                    ? "bg-white dark:bg-[--dark-surface] text-[--green-800] shadow-[--e1]"
                    : "text-[--neutral-500] hover:text-[--neutral-700]"
                }`}
              >
                {r}
              </button>
            ))}
            <button
              onClick={() => setRange("custom")}
              className={`px-3 py-1.5 rounded-[6px] font-dm text-[13px] font-medium transition-colors ${
                range === "custom"
                  ? "bg-white dark:bg-[--dark-surface] text-[--green-800] shadow-[--e1]"
                  : "text-[--neutral-500] hover:text-[--neutral-700]"
              }`}
            >
              Custom
            </button>
          </div>

          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 px-3 rounded-[8px] border border-[--neutral-200] dark:border-[--dark-border] bg-white dark:bg-[--dark-surface] font-dm text-[13px] text-[--neutral-900] dark:text-[--dark-text]"
              />
              <span className="font-dm text-[13px] text-[--neutral-400]">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 px-3 rounded-[8px] border border-[--neutral-200] dark:border-[--dark-border] bg-white dark:bg-[--dark-surface] font-dm text-[13px] text-[--neutral-900] dark:text-[--dark-text]"
              />
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-[--neutral-200] dark:border-[--dark-border] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-dm text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
                activeTab === tab.id
                  ? "border-[--green-600] text-[--green-800] dark:text-[--green-200]"
                  : "border-transparent text-[--neutral-500] hover:text-[--neutral-700] dark:hover:text-[--dark-text]"
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
// Overview tab
// ---------------------------------------------------------------------------
function OverviewTab({ payload, isLoading }: { payload: Record<string, unknown>; isLoading: boolean }) {
  const stats = (payload.stats ?? {}) as Record<string, number>;
  const revenueChart = (payload.revenueChart ?? []) as { date: string; amount: number }[];
  const topProducts = (payload.topProducts ?? []) as { name: string; orders: number; revenue: number; pctOfTotal: number }[];
  const topCustomers = (payload.topCustomers ?? []) as { name: string; email: string; orders: number; totalSpend: number }[];
  const traffic = (payload.trafficSources ?? []) as { source: string; pct: number }[];

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
        <span className="font-dm text-[13px] text-[--neutral-500]">{Number(row.pctOfTotal).toFixed(1)}%</span>,
    },
  ];

  const customerCols = [
    { key: "name", label: "Customer" },
    {
      key: "email",
      label: "Email",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[12px] text-[--neutral-400]">{String(row.email)}</span>,
    },
    { key: "orders", label: "Orders", sortable: true },
    {
      key: "totalSpend",
      label: "Total Spent",
      sortable: true,
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[13px] font-medium text-[--green-600]">{formatKes(Number(row.totalSpend))}</span>,
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
            <StatCard eyebrow="Revenue" value={formatKes(stats.revenue ?? 0)} icon={TrendingUp} />
            <StatCard eyebrow="Orders" value={String(stats.orders ?? 0)} icon={ShoppingCart} />
            <StatCard
              eyebrow="Avg Order Value"
              value={formatKes(stats.aov ?? 0)}
              icon={BarChart2}
            />
            <StatCard
              eyebrow="Conversion Rate"
              value={`${Number(stats.conversionRate ?? 0).toFixed(1)}%`}
              trend={{ value: "placeholder", positive: true }}
            />
            <StatCard eyebrow="New Customers" value={String(stats.newCustomers ?? 0)} icon={Users} />
            <StatCard
              eyebrow="Returning Rate"
              value={`${Number(stats.returningRate ?? 0).toFixed(1)}%`}
              trend={{ value: "placeholder", positive: true }}
            />
          </>
        )}
      </div>

      {/* Revenue + traffic charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="xl:col-span-2"><SkeletonChart /></div>
        ) : (
          <div className="xl:col-span-2 bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6">
            <h3 className="font-syne text-[15px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-4">Revenue Trend</h3>
            {revenueChart.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center">
                <p className="font-dm text-[13px] text-[--neutral-400]">No revenue data for this period</p>
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
          </div>
        )}

        {isLoading ? (
          <SkeletonChart />
        ) : (
          <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6">
            <h3 className="font-syne text-[15px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-4">Traffic Sources</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={traffic} dataKey="pct" nameKey="source" cx="50%" cy="50%" outerRadius={80} isAnimationActive animationDuration={800}>
                  {traffic.map((_, i) => (
                    <Cell key={i} fill={TRAFFIC_COLORS[i % TRAFFIC_COLORS.length]} />
                  ))}
                </Pie>
                <Legend formatter={(v: string) => <span className="font-dm text-[12px] text-[--neutral-700] dark:text-[--dark-text]">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h3 className="font-syne text-[15px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-3">Top Products</h3>
          <DataTable columns={productCols} data={topProducts as Record<string, unknown>[]} loading={isLoading} emptyTitle="No product data" pageSize={5} />
        </div>
        <div>
          <h3 className="font-syne text-[15px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-3">Top Customers</h3>
          <DataTable columns={customerCols} data={topCustomers as Record<string, unknown>[]} loading={isLoading} emptyTitle="No customer data" pageSize={5} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales tab
// ---------------------------------------------------------------------------
function SalesTab({ payload, isLoading }: { payload: Record<string, unknown>; isLoading: boolean }) {
  const revenueChart = (payload.revenueChart ?? []) as { date: string; amount: number }[];
  const orders = (payload.orders ?? []) as Record<string, unknown>[];

  const cols = [
    { key: "id", label: "Order", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-mono text-[13px]">{shortId(String(row.id))}</span> },
    { key: "customer", label: "Customer" },
    { key: "items", label: "Items" },
    { key: "totalKes", label: "Total", sortable: true, render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[13px] font-medium">{formatKes(Number(row.totalKes))}</span> },
    { key: "status", label: "Status", render: (_v: unknown, row: Record<string, unknown>) => <StatusPill status={String(row.status)} /> },
    { key: "createdAt", label: "Date", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[12px] text-[--neutral-400]">{shortDate(String(row.createdAt))}</span> },
  ];

  return (
    <div className="space-y-6">
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6">
          <h3 className="font-syne text-[15px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-4">Daily Revenue</h3>
          {revenueChart.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center"><p className="font-dm text-[13px] text-[--neutral-400]">No sales data for this period</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenueChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tickFormatter={chartLabel} tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => `KES ${(v / 100).toLocaleString()}`} tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<KesTooltip />} />
                <Bar dataKey="amount" fill="var(--green-500)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          )}
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
    { key: "stock", label: "Stock", sortable: true, render: (_v: unknown, row: Record<string, unknown>) => <span className={`font-dm text-[13px] font-medium ${Number(row.stock) < 5 ? "text-[--danger]" : Number(row.stock) < 10 ? "text-[--gold-700]" : "text-[--success]"}`}>{String(row.stock)}</span> },
    { key: "orders", label: "Orders", sortable: true },
    { key: "revenue", label: "Revenue", sortable: true, render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[13px]">{formatKes(Number(row.revenue))}</span> },
    { key: "ratingAvg", label: "Rating", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[13px] text-[--neutral-500]">{Number(row.ratingAvg).toFixed(1)} ({Number(row.ratingCount)})</span> },
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
    { key: "email", label: "Email", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[12px] text-[--neutral-400]">{String(row.email)}</span> },
    { key: "orders", label: "Orders", sortable: true },
    { key: "totalSpent", label: "Total Spent", sortable: true, render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[13px] font-medium text-[--green-600]">{formatKes(Number(row.totalSpent))}</span> },
    { key: "lastOrder", label: "Last Order", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[12px] text-[--neutral-400]">{row.lastOrder ? shortDate(String(row.lastOrder)) : "—"}</span> },
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
    { key: "createdAt", label: "Created", render: (_v: unknown, row: Record<string, unknown>) => <span className="font-dm text-[12px] text-[--neutral-400]">{shortDate(String(row.createdAt))}</span> },
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
        <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6">
          <h3 className="font-syne text-[15px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-4">Stock by Category</h3>
          {stockByCategory.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center"><p className="font-dm text-[13px] text-[--neutral-400]">No stock data available</p></div>
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
