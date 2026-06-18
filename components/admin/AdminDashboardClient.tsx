"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
type RevenuePoint = { date: string; amount: number };
type StatusCount = { status: string; count: number };

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
  stats: {
    revenue: number;
    orders: number;
    newCustomers: number;
    lowStock: number;
  };
  recentOrders: RecentOrder[];
  lowStockProducts: LowStockProduct[];
  revenueChart: RevenuePoint[];
  ordersByStatus: StatusCount[];
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
  return d.toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}

// Donut slice colours per OrderStatus value
const STATUS_COLORS: Record<string, string> = {
  PENDING:    "var(--gold-500)",
  CONFIRMED:  "var(--green-500)",
  PROCESSING: "var(--gold-700)",
  SHIPPED:    "var(--info)",
  DELIVERED:  "var(--success)",
  CANCELLED:  "var(--danger)",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[--dark-surface] border border-[--neutral-200] dark:border-[--dark-border] rounded-[8px] px-3 py-2 shadow-[--e2]">
      <p className="font-dm text-[12px] text-[--neutral-500] mb-1">{label}</p>
      <p className="font-syne text-[14px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">
        {formatKes(payload[0].value)}
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
    <div className="bg-white dark:bg-[--dark-surface] rounded-[10px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-4 flex items-center gap-3">
      <div className="w-12 h-12 rounded-[8px] bg-[--neutral-100] dark:bg-[--dark-bg] flex-shrink-0 overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={20} className="text-[--neutral-300]" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-dm text-[13px] font-medium text-[--neutral-900] dark:text-[--dark-text] truncate">
          {product.name}
        </p>
        <p
          className={`font-dm text-[12px] font-semibold mt-0.5 ${
            product.stock < 5
              ? "text-[--danger]"
              : "text-[--gold-700]"
          }`}
        >
          {product.stock} in stock
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminDashboardClient() {
  const { data, isLoading } = useQuery<{ ok: boolean; data: DashboardData }>({
    queryKey: ["admin-dashboard"],
    queryFn: () => fetch("/api/admin/dashboard").then((r) => r.json()),
    staleTime: 5 * 60 * 1000, // 5-minute cache — dashboard stats change infrequently
  });

  const dashboard = data?.data;
  const stats = dashboard?.stats;

  const today = new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Recent orders table columns
  const orderColumns = [
    {
      key: "id",
      label: "Order",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-mono text-[13px]">{shortId(String(row.id))}</span>,
    },
    {
      key: "user",
      label: "Customer",
      render: (_v: unknown, row: Record<string, unknown>) => {
        const u = row.user as { name: string; email: string } | null;
        return u ? (
          <div>
            <p className="font-dm text-[13px] text-[--neutral-900] dark:text-[--dark-text]">{u.name}</p>
            <p className="font-dm text-[11px] text-[--neutral-400]">{u.email}</p>
          </div>
        ) : (
          <span className="font-dm text-[13px] text-[--neutral-400]">Guest</span>
        );
      },
    },
    {
      key: "totalKes",
      label: "Total",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[13px] font-medium">{formatKes(Number(row.totalKes))}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <StatusPill status={String(row.status)} />,
    },
    {
      key: "paymentStatus",
      label: "Payment",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <StatusPill status={String(row.paymentStatus)} />,
    },
    {
      key: "createdAt",
      label: "Date",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[12px] text-[--neutral-400]">{shortDate(String(row.createdAt))}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        goldWash
        action={
          <span className="font-dm text-[13px] text-[--neutral-500]">
            {today}
          </span>
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {/* ── Stat cards ── */}
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

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Revenue line chart — 2/3 width */}
          {isLoading ? (
            <div className="xl:col-span-2"><SkeletonChart /></div>
          ) : (
            <div className="xl:col-span-2 bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6">
              <h2 className="font-syne text-[16px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-1">
                Revenue — last 30 days
              </h2>
              <p className="font-dm text-[13px] text-[--neutral-400] mb-5">
                Daily revenue from paid orders (KES)
              </p>
              {(dashboard?.revenueChart ?? []).length === 0 ? (
                <div className="h-[280px] flex items-center justify-center">
                  <p className="font-dm text-[13px] text-[--neutral-400]">No revenue data yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={dashboard?.revenueChart ?? []}
                    margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--green-500)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--green-500)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={chartDateLabel}
                      tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }}
                      axisLine={false}
                      tickLine={false}
                      interval={4}
                    />
                    <YAxis
                      tickFormatter={(v) => `KES ${(v / 100).toLocaleString()}`}
                      tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }}
                      axisLine={false}
                      tickLine={false}
                      width={80}
                    />
                    <Tooltip content={<RevenueTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="var(--green-500)"
                      strokeWidth={2.5}
                      fill="url(#revenueGradient)"
                      isAnimationActive
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Orders donut — 1/3 width */}
          {isLoading ? (
            <SkeletonChart />
          ) : (
            <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6">
              <h2 className="font-syne text-[16px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-1">
                Orders by Status
              </h2>
              <p className="font-dm text-[13px] text-[--neutral-400] mb-4">
                All time distribution
              </p>
              {(dashboard?.ordersByStatus ?? []).length === 0 ? (
                <div className="h-[220px] flex items-center justify-center">
                  <p className="font-dm text-[13px] text-[--neutral-400]">No orders yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={dashboard?.ordersByStatus ?? []}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      isAnimationActive
                      animationDuration={800}
                    >
                      {(dashboard?.ordersByStatus ?? []).map((entry) => (
                        <Cell
                          key={entry.status}
                          fill={STATUS_COLORS[entry.status] ?? "var(--neutral-300)"}
                        />
                      ))}
                    </Pie>
                    <Legend
                      formatter={(value: string) =>
                        <span className="font-dm text-[12px] text-[--neutral-700] dark:text-[--dark-text]">
                          {value.charAt(0) + value.slice(1).toLowerCase()}
                        </span>
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom row: Recent Orders + Low Stock ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Recent orders table — 2/3 */}
          <div className="xl:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-syne text-[16px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">
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

          {/* Low stock grid — 1/3 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-syne text-[16px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">
                Low Stock
              </h2>
              <span className="font-dm text-[12px] text-[--danger]">
                Stock &lt; 10
              </span>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[60px] rounded-[10px] bg-[--neutral-100] dark:bg-[--dark-border] animate-pulse"
                  />
                ))}
              </div>
            ) : (dashboard?.lowStockProducts ?? []).length === 0 ? (
              <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-8 text-center">
                <p className="font-dm text-[13px] text-[--neutral-400]">
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
      </div>
    </div>
  );
}
