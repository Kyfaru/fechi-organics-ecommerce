"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type OrderItem = {
  name: string;
  quantity: number;
  priceKes: number;
};

type AdminOrder = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  subtotalKes: number;
  deliveryKes: number;
  discountKes: number;
  totalKes: number;
  promoCode: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  items: OrderItem[];
};

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<
  AdminOrder["status"],
  { label: string; bg: string; color: string }
> = {
  PENDING:    { label: "Pending",    bg: "#fef9c3", color: "#854d0e" },
  CONFIRMED:  { label: "Confirmed",  bg: "#dbeafe", color: "#1e40af" },
  PROCESSING: { label: "Processing", bg: "#dbeafe", color: "#1e40af" },
  SHIPPED:    { label: "Shipped",    bg: "#f3e8ff", color: "#6b21a8" },
  DELIVERED:  { label: "Delivered",  bg: "#dcfce7", color: "#166534" },
  CANCELLED:  { label: "Cancelled",  bg: "#fee2e2", color: "#991b1b" },
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as AdminOrder["status"][];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: AdminOrder["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 font-body font-semibold text-[11px] tracking-[0.4px]"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status updater dropdown
// ---------------------------------------------------------------------------
function StatusUpdater({
  orderId,
  current,
}: {
  orderId: string;
  current: AdminOrder["status"];
}) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async (status: AdminOrder["status"]) => {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Update failed");
      return status;
    },
    onSuccess: (status) => {
      toast.success(`Status updated to ${STATUS_CONFIG[status].label}`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={current} />
      <select
        value={current}
        disabled={update.isPending}
        onChange={(e) => update.mutate(e.target.value as AdminOrder["status"])}
        className="text-[12px] font-body border border-[#c0cab8] rounded-[6px] px-2 py-1 bg-white text-[#1a1c1c] focus:outline-none focus:border-[#27731e] disabled:opacity-60"
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_CONFIG[s].label}
          </option>
        ))}
      </select>
      {update.isPending && <Spinner size={14} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
function StatCard({
  icon,
  label,
  value,
  isLoading,
}: {
  icon: string;
  label: string;
  value: number | string;
  isLoading: boolean;
}) {
  return (
    <div className="bg-white rounded-[16px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: "#e8fce3" }}
      >
        <Icon icon={icon} width={20} style={{ color: "#27731e" }} />
      </div>
      <div>
        <p className="font-body text-[#a1a1a1] text-[12px] uppercase tracking-[0.6px]">{label}</p>
        {isLoading ? (
          <Skeleton className="h-5 w-10 rounded mt-1" />
        ) : (
          <p className="font-heading font-semibold text-[#1a1c1c] text-[20px] leading-tight mt-0.5">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminOrdersClient() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    ok: boolean;
    data: { orders: AdminOrder[] };
  }>({
    queryKey: ["admin-orders"],
    queryFn: () => fetch("/api/admin/orders").then((r) => r.json()),
    staleTime: 30_000,
  });

  const orders: AdminOrder[] = data?.data?.orders ?? [];

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "PENDING").length;
  const deliveredOrders = orders.filter((o) => o.status === "DELIVERED").length;

  return (
    <div className="p-6 md:p-8 max-w-[1280px]">
      {/* Page header */}
      <div className="bg-white border-b border-[#e2e2e2] rounded-t-[12px] px-6 py-6 flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-semibold text-[#1a1c1c] text-[24px]">Orders</h1>
          <p className="font-body text-[#40493c] text-[13px] mt-0.5">
            {isLoading ? "Loading…" : `${totalOrders} order${totalOrders !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon="mdi:receipt-outline"
          label="Total Orders"
          value={totalOrders}
          isLoading={isLoading}
        />
        <StatCard
          icon="mdi:clock-outline"
          label="Pending"
          value={pendingOrders}
          isLoading={isLoading}
        />
        <StatCard
          icon="mdi:check-circle-outline"
          label="Delivered"
          value={deliveredOrders}
          isLoading={isLoading}
        />
      </div>

      {/* Orders table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden"
      >
        {isLoading ? (
          <div className="p-8 flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-[8px]" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#e8fce3" }}
            >
              <Icon icon="mdi:receipt-text-outline" width={32} style={{ color: "#27731e" }} />
            </div>
            <h3 className="font-heading font-semibold text-[#1a1c1c] text-[20px] mb-2">
              No orders yet
            </h3>
            <p className="font-body text-[#40493c] text-[14px] max-w-[340px]">
              Orders placed through the storefront will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#e2e2e2]">
                  {["Order ID", "Customer", "Items", "Total", "Status", "Date"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 font-body font-semibold text-[12px] text-[#a1a1a1] uppercase tracking-[0.6px] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isExpanded = expandedId === order.id;
                  return (
                    <>
                      <tr
                        key={order.id}
                        className="border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors cursor-pointer"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : order.id)
                        }
                      >
                        {/* Order ID */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-body font-semibold text-[13px] text-[#1a1c1c] font-mono">
                              #{shortId(order.id)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(order.id);
                                toast.success("Order ID copied");
                              }}
                              className="text-[#a1a1a1] hover:text-[#27731e] transition-colors"
                              aria-label="Copy order ID"
                            >
                              <Icon icon="mdi:content-copy" width={13} />
                            </button>
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="px-5 py-4">
                          {order.user ? (
                            <div>
                              <p className="font-body text-[13px] text-[#1a1c1c] font-medium">
                                {order.user.name}
                              </p>
                              <p className="font-body text-[11px] text-[#707a6b]">
                                {order.user.email}
                              </p>
                            </div>
                          ) : (
                            <span className="font-body text-[13px] text-[#a1a1a1]">Guest</span>
                          )}
                        </td>

                        {/* Items count */}
                        <td className="px-5 py-4">
                          <span className="font-body text-[13px] text-[#40493c]">
                            {order.items.reduce((s, i) => s + i.quantity, 0)} item
                            {order.items.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""}
                          </span>
                        </td>

                        {/* Total */}
                        <td className="px-5 py-4">
                          <span className="font-body font-semibold text-[13px] text-[#1a1c1c] whitespace-nowrap">
                            {formatKes(order.totalKes)}
                          </span>
                        </td>

                        {/* Status */}
                        <td
                          className="px-5 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <StatusUpdater
                            orderId={order.id}
                            current={order.status}
                          />
                        </td>

                        {/* Date */}
                        <td className="px-5 py-4">
                          <span className="font-body text-[12px] text-[#707a6b] whitespace-nowrap">
                            {new Date(order.createdAt).toLocaleDateString("en-KE", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded row — line item breakdown */}
                      {isExpanded && (
                        <tr key={`${order.id}-expanded`} className="bg-[#f9fdf8]">
                          <td colSpan={6} className="px-8 py-4">
                            <p className="font-body font-semibold text-[12px] text-[#40493c] mb-2 uppercase tracking-[0.5px]">
                              Line items
                            </p>
                            <div className="flex flex-col gap-1.5">
                              {order.items.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between max-w-[480px]"
                                >
                                  <span className="font-body text-[13px] text-[#1a1c1c]">
                                    {item.name} × {item.quantity}
                                  </span>
                                  <span className="font-body text-[13px] text-[#40493c]">
                                    {formatKes(item.priceKes * item.quantity)}
                                  </span>
                                </div>
                              ))}
                              {order.promoCode && (
                                <p className="font-body text-[12px] text-[#27731e] mt-1">
                                  Promo: {order.promoCode} (−{formatKes(order.discountKes)})
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
