"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
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
  Receipt,
  Clock,
  RotateCcw,
} from "lucide-react";
import { StatCard } from "@/components/admin/ui/StatCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SkeletonStatCard, SkeletonChart } from "@/components/admin/ui/Skeleton";
import DownloadButton from "@/components/ui/DownloadButton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TxStatus = "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT";
type PaymentProvider = "MPESA" | "PAYHERO";

// Payment methods pie filter — matches TxStatus vocabulary plus "ALL" and "CANCELLED"
type PieFilter = "ALL" | "SUCCESSFUL" | "FAILED" | "CANCELLED";

type AdminTransaction = {
  id: string;
  provider: PaymentProvider;
  amount: number;
  status: TxStatus;
  mpesaReceiptNumber: string | null;
  failureReason: string | null;
  createdAt: string;
  order: {
    id: string;
    user: { name: string; email: string } | null;
  } | null;
};

type ApiResponse = {
  ok: boolean;
  data: {
    transactions: AdminTransaction[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
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

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    month: "short",
    year: "2-digit",
  });
}

// Build last-12-months bar chart data from transaction list
function buildMonthlyRevenue(transactions: AdminTransaction[]) {
  const now = new Date();
  const map: Record<string, number> = {};

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map[key] = 0;
  }

  for (const tx of transactions) {
    if (tx.status !== "SUCCESS") continue;
    const d = new Date(tx.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key in map) map[key] = (map[key] ?? 0) + tx.amount;
  }

  return Object.entries(map).map(([key, amount]) => ({
    month: monthLabel(`${key}-01`),
    amount,
  }));
}

// ---------------------------------------------------------------------------
// Derive payment provider pie data based on active filter (F4)
// ---------------------------------------------------------------------------
function buildProviderData(transactions: AdminTransaction[], filter: PieFilter) {
  let filtered: AdminTransaction[];

  switch (filter) {
    case "ALL":
      filtered = transactions;
      break;
    case "SUCCESSFUL":
      // Match the existing behavior: status === "SUCCESS" (TxStatus)
      filtered = transactions.filter((t) => t.status === "SUCCESS");
      break;
    case "FAILED":
      filtered = transactions.filter((t) => t.status === "FAILED" || t.status === "TIMEOUT");
      break;
    case "CANCELLED":
      // There is no "CANCELLED" TxStatus in the schema; treat TIMEOUT as closest
      // or show empty. We use a separate bucket here for UX completeness.
      filtered = transactions.filter((t) => t.status === "TIMEOUT");
      break;
    default:
      filtered = transactions;
  }

  const mpesa = filtered.filter((t) => t.provider === "MPESA").length;
  const payhero = filtered.filter((t) => t.provider === "PAYHERO").length;

  return [
    { provider: "M-Pesa", count: mpesa },
    { provider: "PayHero", count: payhero },
  ].filter((p) => p.count > 0);
}

// ---------------------------------------------------------------------------
// Tooltip
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

// ---------------------------------------------------------------------------
// Export handler — triggers CSV download from server
// Used by DownloadButton via onDownload prop
// ---------------------------------------------------------------------------
async function handleExportCsv(): Promise<void> {
  const res = await fetch("/api/admin/finance/export", { method: "POST" });
  if (!res.ok) {
    console.error("[finance/export] failed:", res.status);
    throw new Error(`Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminTransactionsClient() {
  // Filter state for the payment methods pie chart (F4)
  const [pieFilter, setPieFilter] = useState<PieFilter>("SUCCESSFUL");

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-finance"],
    queryFn: () => fetch("/api/admin/transactions").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    // Refresh every 30s — payments can confirm at any time
    refetchInterval: 30_000,
  });

  const transactions = data?.data?.transactions ?? [];
  const total = data?.data?.pagination?.total ?? 0;

  // Derived stats — computed from the fetched page.
  // For fully accurate totals, the API would need to return aggregate fields.
  const successTxns = transactions.filter((t) => t.status === "SUCCESS");
  const pendingTxns = transactions.filter((t) => t.status === "PENDING");
  const totalRevenue = successTxns.reduce((s, t) => s + t.amount, 0);

  const monthlyRevenue = buildMonthlyRevenue(transactions);

  // Derive pie data from loaded transactions filtered by active toggle (F4)
  const providerData = buildProviderData(transactions, pieFilter);

  // DataTable columns
  const columns = [
    {
      key: "id",
      label: "Tx ID",
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-mono text-[12px]">{shortId(String(row.id))}</span>,
    },
    {
      key: "order",
      label: "Order",
      render: (_v: unknown, row: Record<string, unknown>) => {
        const o = row.order as { id: string } | null;
        return o
          ? <span className="font-mono text-[12px] text-(--neutral-500)">{shortId(o.id)}</span>
          : <span className="font-dm text-[12px] text-(--neutral-400)">—</span>;
      },
    },
    {
      key: "customer",
      label: "Customer",
      render: (_v: unknown, row: Record<string, unknown>) => {
        const o = row.order as { id: string; user: { name: string; email: string } | null } | null;
        return o?.user
          ? (
            <div>
              <p className="font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text)">{o.user.name}</p>
              <p className="font-dm text-[11px] text-(--neutral-400)">{o.user.email}</p>
            </div>
          )
          : <span className="font-dm text-[13px] text-(--neutral-400)">—</span>;
      },
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      render: (_v: unknown, row: Record<string, unknown>) => {
        const status = String(row.status);
        const isSuccess = status === "SUCCESS";
        return (
          <span className={`font-dm text-[13px] font-medium ${isSuccess ? "text-(--green-600)" : "text-(--danger)"}`}>
            {formatKes(Number(row.amount))}
          </span>
        );
      },
    },
    {
      key: "provider",
      label: "Method",
      render: (_v: unknown, row: Record<string, unknown>) => {
        const p = String(row.provider);
        const label = p === "MPESA" ? "M-Pesa" : "PayHero";
        const cls = p === "MPESA"
          ? "bg-(--green-50) text-(--green-800)"
          : "bg-(--gold-50) text-(--gold-700)";
        return (
          <span className={`inline-flex items-center rounded-full px-[10px] h-6 font-dm text-[12px] font-medium ${cls}`}>
            {label}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (_v: unknown, row: Record<string, unknown>) => {
        const s = String(row.status).toLowerCase();
        // Map SUCCESS → paid for StatusPill colour mapping
        const mapped = s === "success" ? "paid" : s;
        return <StatusPill status={mapped} />;
      },
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (_v: unknown, row: Record<string, unknown>) =>
        <span className="font-dm text-[12px] text-(--neutral-400)">{shortDate(String(row.createdAt))}</span>,
    },
  ];

  // Pie filter toggle definitions (F4)
  const pieFilters: { id: PieFilter; label: string }[] = [
    { id: "ALL", label: "All" },
    { id: "SUCCESSFUL", label: "Successful" },
    { id: "FAILED", label: "Failed" },
    { id: "CANCELLED", label: "Cancelled" },
  ];

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Revenue, transactions and payment records"
        action={<DownloadButton onDownload={handleExportCsv} label="Export CSV" />}
      />

      <div className="px-6 pb-8 space-y-6">
        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          ) : (
            <>
              <StatCard
                eyebrow="Total Revenue"
                value={formatKes(totalRevenue)}
                icon={TrendingUp}
              />
              <StatCard
                eyebrow="Transactions"
                value={String(total)}
                icon={Receipt}
              />
              <StatCard
                eyebrow="Pending Payments"
                value={String(pendingTxns.length)}
                icon={Clock}
                trend={pendingTxns.length > 0 ? { value: "awaiting confirmation", positive: false } : undefined}
              />
              <StatCard
                eyebrow="Refunds"
                value="KES 0.00"
                icon={RotateCcw}
              />
            </>
          )}
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Monthly revenue bar chart — 2/3 */}
          {isLoading ? (
            <div className="xl:col-span-2"><SkeletonChart /></div>
          ) : (
            <div className="xl:col-span-2 bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
              <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">
                Monthly Revenue
              </h2>
              <p className="font-dm text-[13px] text-(--neutral-400) mb-5">
                Last 12 months — successful payments (KES)
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyRevenue} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `KES ${(v / 100).toLocaleString()}`}
                    tick={{ fontFamily: "var(--font-dm)", fontSize: 11, fill: "var(--neutral-400)" }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip content={<KesTooltip />} />
                  <Bar
                    dataKey="amount"
                    fill="var(--green-500)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Payment methods donut with filter toggles — 1/3 (F4) */}
          {isLoading ? (
            <SkeletonChart />
          ) : (
            <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
              {/* Card header with filter toggles */}
              <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">
                Payment Methods
              </h2>

              {/* Filter toggle pills */}
              <div className="flex flex-wrap gap-1 mb-4">
                {pieFilters.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setPieFilter(f.id)}
                    className={`px-2.5 py-1 rounded-full font-dm text-[11px] font-medium border transition-colors ${
                      pieFilter === f.id
                        ? "bg-(--green-800) border-(--green-800) text-white"
                        : "border-(--neutral-200) dark:border-(--dark-border) text-(--neutral-500) hover:text-(--neutral-700) dark:hover:text-(--dark-text)"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {providerData.length === 0 ? (
                // Empty state: show donut outline + message in center (F4)
                <div className="relative h-[200px] flex items-center justify-center">
                  <svg width="140" height="140" viewBox="0 0 140 140" className="absolute opacity-10">
                    <circle cx="70" cy="70" r="55" fill="none" stroke="var(--neutral-400)" strokeWidth="20" />
                  </svg>
                  <p className="font-dm text-[13px] text-(--neutral-400) text-center z-10">
                    No data for this filter
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={providerData}
                      dataKey="count"
                      nameKey="provider"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      isAnimationActive
                      animationDuration={600}
                    >
                      <Cell fill="var(--green-500)" />
                      <Cell fill="var(--gold-500)" />
                    </Pie>
                    <Legend
                      formatter={(v: string) =>
                        <span className="font-dm text-[12px] text-(--neutral-700) dark:text-(--dark-text)">{v}</span>
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>

        {/* ── Transactions table ── */}
        <DataTable
          columns={columns}
          data={transactions as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No transactions yet"
          emptyDescription="Payment transactions will appear here once customers start checking out."
          pageSize={20}
        />
      </div>
    </div>
  );
}
