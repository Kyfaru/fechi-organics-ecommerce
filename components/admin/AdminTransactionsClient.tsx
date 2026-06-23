"use client";

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
  Download,
} from "lucide-react";
import { StatCard } from "@/components/admin/ui/StatCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SkeletonStatCard, SkeletonChart } from "@/components/admin/ui/Skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TxStatus = "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT";
type PaymentProvider = "MPESA" | "PAYHERO";

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
// Export button — triggers CSV download from server
// ---------------------------------------------------------------------------
function ExportButton() {
  async function handleExport() {
    try {
      const res = await fetch("/api/admin/finance/export", { method: "POST" });
      if (!res.ok) {
        console.error("[finance/export] failed:", res.status);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[finance/export] error:", e);
    }
  }

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 h-9 px-4 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) text-white font-dm text-[13px] font-medium transition-colors"
    >
      <Download size={14} />
      Export CSV
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminTransactionsClient() {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-finance"],
    queryFn: () => fetch("/api/admin/transactions").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    // Refresh every 30s — payments can confirm at any time
    refetchInterval: 30_000,
  });

  const transactions = data?.data?.transactions ?? [];
  const total = data?.data?.pagination?.total ?? 0;

  // Derived stats — computed in the client from the fetched page.
  // For a full accurate total, the API would need to return aggregate fields.
  // This is the loaded page sample; for production, extend the API to return aggregates.
  const successTxns = transactions.filter((t) => t.status === "SUCCESS");
  const pendingTxns = transactions.filter((t) => t.status === "PENDING");
  const totalRevenue = successTxns.reduce((s, t) => s + t.amount, 0);

  const monthlyRevenue = buildMonthlyRevenue(transactions);

  const mpesaCount = successTxns.filter((t) => t.provider === "MPESA").length;
  const payHeroCount = successTxns.filter((t) => t.provider === "PAYHERO").length;
  const providerData = [
    { provider: "M-Pesa", count: mpesaCount },
    { provider: "PayHero", count: payHeroCount },
  ].filter((p) => p.count > 0);

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

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Revenue, transactions and payment records"
        action={<ExportButton />}
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

          {/* Payment method donut — 1/3 */}
          {isLoading ? (
            <SkeletonChart />
          ) : (
            <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
              <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">
                Payment Methods
              </h2>
              <p className="font-dm text-[13px] text-(--neutral-400) mb-4">
                Successful transactions by provider
              </p>
              {providerData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center">
                  <p className="font-dm text-[13px] text-(--neutral-400)">No successful payments yet</p>
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
                      animationDuration={800}
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
