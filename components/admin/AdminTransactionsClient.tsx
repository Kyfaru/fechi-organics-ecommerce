"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SkeletonStatCard, SkeletonChart } from "@/components/admin/ui/Skeleton";
import { Download } from "lucide-react";
import { DonutChart, type DonutChartSegment } from "@/components/ui/donut-chart";
import { VisxBarChart } from "@/components/ui/bar-chart-visx";
import { ChannelStatCard } from "@/components/ui/channel-stat-card";
import { StatSetSlider } from "@/components/ui/stat-set-slider";
import { ExportModal } from "@/components/admin/exports/ExportModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TxStatus = "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT";
type PaymentProvider = "MPESA" | "PAYSTACK" | "KCB";

// Payment methods pie filter — matches TxStatus vocabulary plus "ALL" and "CANCELLED"
type PieFilter = "ALL" | "SUCCESSFUL" | "FAILED" | "CANCELLED";

type AdminTransaction = {
  id: string;
  provider: PaymentProvider;
  amount: number;
  status: TxStatus;
  mpesaReceiptNumber: string | null;
  failureReason: string | null;
  mpesaGatewayUsed: "DARAJA" | "KCB_BUNI" | null;
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
    stats: {
      totalRevenue: number;
      pending: number;
      totalTransactions: number;
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
  const paystack = filtered.filter((t) => t.provider === "PAYSTACK").length;
  const kcb = filtered.filter((t) => t.provider === "KCB").length;

  return [
    { provider: "M-Pesa", count: mpesa },
    { provider: "Paystack", count: paystack },
    { provider: "KCB Buni", count: kcb },
  ].filter((p) => p.count > 0);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminTransactionsClient() {
  // Filter state for the payment methods pie chart (F4)
  const [pieFilter, setPieFilter] = useState<PieFilter>("SUCCESSFUL");
  const [exportOpen, setExportOpen] = useState(false);
  const [statSet, setStatSet] = useState(0);

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-finance"],
    queryFn: () => fetch("/api/admin/transactions").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    // Refresh every 30s — payments can confirm at any time
    refetchInterval: 30_000,
  });

  const transactions = data?.data?.transactions ?? [];

  const monthlyRevenue = buildMonthlyRevenue(transactions);

  // Derive pie data from loaded transactions filtered by active toggle (F4)
  const providerData = buildProviderData(transactions, pieFilter);

  // DonutChart segments — derived from filtered providerData
  const paymentMethodSegments: DonutChartSegment[] = [
    { label: "M-Pesa", value: providerData.find((p) => p.provider === "M-Pesa")?.count ?? 0, color: "var(--green-500, #22c55e)" },
    { label: "Paystack", value: providerData.find((p) => p.provider === "Paystack")?.count ?? 0, color: "var(--gold-500, #eab308)" },
    { label: "KCB Buni", value: providerData.find((p) => p.provider === "KCB Buni")?.count ?? 0, color: "var(--info, #3b82f6)" },
  ].filter((s) => s.value > 0);

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
        const label = p === "MPESA" ? "M-Pesa" : p === "KCB" ? "KCB Buni" : "Paystack";
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
      key: "mpesaGatewayUsed",
      label: "Route",
      render: (_v: unknown, row: Record<string, unknown>) => {
        const gateway = row.mpesaGatewayUsed as "DARAJA" | "KCB_BUNI" | null;
        if (!gateway) return <span className="text-(--neutral-400)">—</span>;
        const label = gateway === "KCB_BUNI" ? "KCB Buni" : "Daraja";
        return (
          <span className="inline-flex items-center rounded-full px-[10px] h-6 bg-(--info)/10 text-(--info) font-dm text-[12px] font-medium">
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

  const statSet1 = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <ChannelStatCard title="Total Revenue" metric="revenue" scope="total" accent="emerald" valueFormatter={formatKesCompact} />
      <ChannelStatCard title="Website Revenue" metric="revenue" scope="website" accent="blue" valueFormatter={formatKesCompact} />
      <ChannelStatCard title="Total Transactions" metric="transactions" accent="violet" valueFormatter={(v) => v.toLocaleString()} />
    </div>
  );

  const statSet2 = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <ChannelStatCard title="Home Delivery Revenue" metric="revenue" scope="home-delivery" accent="amber" valueFormatter={formatKesCompact} />
      <ChannelStatCard title="Store Pickup Revenue" metric="revenue" scope="store-pickup" accent="rose" valueFormatter={formatKesCompact} />
      <ChannelStatCard title="Instore Revenue" metric="revenue" scope="instore" accent="neutral" valueFormatter={formatKesCompact} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Revenue, transactions and payment records"
        action={
          <button
            onClick={() => setExportOpen(true)}
            className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center gap-2 transition-colors"
          >
            <Download size={14} /> Export
          </button>
        }
      />

      <ExportModal resource="finance" open={exportOpen} onClose={() => setExportOpen(false)} />

      <div className="px-6 pb-8 space-y-6">
        {/* ── Stat cards — two transitioning sets ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
        ) : (
          <StatSetSlider sets={[statSet1, statSet2]} index={statSet} onChange={setStatSet} />
        )}

        {/* ── Charts row — 2-column ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly revenue bar chart */}
          {isLoading ? (
            <SkeletonChart />
          ) : (
            <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
              <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">
                Monthly Revenue
              </h2>
              <p className="font-dm text-[13px] text-(--neutral-400) mb-5">
                Last 12 months — successful payments (KES)
              </p>
              <VisxBarChart
                data={monthlyRevenue.map((r) => ({ label: r.month, value: r.amount / 100 }))}
                color="var(--green-500, #22c55e)"
                height={240}
                formatY={(v) => `KES ${(v / 1000).toFixed(0)}K`}
              />
            </div>
          )}

          {/* Payment methods donut with filter toggles (F4) */}
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

              <DonutChart
                data={paymentMethodSegments.length > 0 ? paymentMethodSegments : [
                  { label: "M-Pesa", value: 60, color: "var(--green-500, #22c55e)" },
                  { label: "Paystack", value: 25, color: "var(--gold-500, #eab308)" },
                  { label: "KCB Buni", value: 15, color: "var(--info, #3b82f6)" },
                ]}
                size={220}
                strokeWidth={32}
                valueFormatter={(v) => v.toLocaleString()}
              />
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
