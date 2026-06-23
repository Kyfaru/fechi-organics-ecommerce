"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ShoppingBag, Clock, Truck, CheckCircle, Search, Download,
  ChevronDown, MoreHorizontal, X, Tag, User, CreditCard, Printer, Link2,
  MapPin, Check,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatCard } from "@/components/admin/ui/StatCard";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
type PaymentStatus = "PENDING" | "PAID" | "FAILED";

type OrderItemDetail = {
  id: string;
  name: string;
  quantity: number;
  priceKes: number;
  product?: {
    name: string;
    images: { objectKey: string }[];
  };
};

type AdminOrder = {
  id: string;
  status: OrderStatus;
  subtotalKes: number;
  deliveryKes: number;
  discountKes: number;
  totalKes: number;
  paymentStatus: PaymentStatus;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryCounty: string | null;
  deliveryPhone: string | null;
  deliveryType: "PICKUP" | "DELIVERY" | null;
  guestEmail: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  branch: { id: string; name: string; county: string } | null;
  items: OrderItemDetail[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_STEPS: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Placed", CONFIRMED: "Confirmed", PROCESSING: "Processing",
  SHIPPED: "Shipped", DELIVERED: "Delivered", CANCELLED: "Cancelled",
};

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function itemImageUrl(item: OrderItemDetail): string | null {
  const key = item.product?.images?.[0]?.objectKey;
  if (!key) return null;
  if (key.startsWith("http")) return key;
  if (!R2_BASE) return null;
  return `${R2_BASE.replace(/\/$/, "")}/${key}`;
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisMonth(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// ---------------------------------------------------------------------------
// Fulfillment stepper
// ---------------------------------------------------------------------------
function FulfillmentStepper({ status }: { status: OrderStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(status);
  const isCancelled = status === "CANCELLED";

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-8 h-8 rounded-full bg-(--danger-bg) flex items-center justify-center shrink-0">
          <X size={14} className="text-(--danger)" />
        </div>
        <span className="font-dm text-[14px] font-medium text-(--danger)">Order Cancelled</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {STATUS_STEPS.map((step, idx) => {
        const reached = idx <= currentIdx;
        const isActive = idx === currentIdx;
        return (
          <div key={step} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                reached ? "bg-(--green-800)" : "bg-(--neutral-100) border-2 border-(--neutral-300)"
              }`}
            >
              {reached ? <Check size={14} className="text-white" /> : null}
            </div>
            <div className="flex-1">
              <p className={`font-dm text-[13px] font-medium ${isActive ? "text-(--green-800)" : reached ? "text-(--neutral-700)" : "text-(--neutral-400)"}`}>
                {STATUS_LABELS[step]}
              </p>
            </div>
            {isActive && (
              <span className="h-5 px-2 rounded-full bg-(--green-50) font-dm text-[11px] font-medium text-(--green-800) flex items-center">
                Current
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order Detail Drawer
// ---------------------------------------------------------------------------
function OrderDetailDrawer({
  order,
  open,
  onClose,
}: {
  order: AdminOrder | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Update failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Order status updated");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;

  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);

  const footer = null; // Actions inside the drawer body

  return (
    <>
      <Drawer open={open} onClose={onClose} title={`Order ${shortId(order.id)}`} width={640} footer={footer}>
        <div className="flex gap-6">
          {/* ── Left 60% ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">

            {/* Fulfillment stepper */}
            <div className="bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-3">Fulfillment</p>
              <FulfillmentStepper status={order.status} />
            </div>

            {/* Order items */}
            <div>
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-3">
                Items ({totalQty})
              </p>
              <div className="flex flex-col gap-2">
                {order.items.map((item) => {
                  const imgSrc = itemImageUrl(item);
                  const subtotal = (item.priceKes / 100) * item.quantity;
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-2 border-b border-(--neutral-100) last:border-0">
                      <div className="w-10 h-10 rounded-[6px] bg-(--neutral-100) overflow-hidden shrink-0 flex items-center justify-center">
                        {imgSrc
                          ? <Image src={imgSrc} alt={item.name} width={40} height={40} className="object-cover w-full h-full" />
                          : <Tag size={14} className="text-(--neutral-300)" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-dm text-[13px] font-medium text-(--neutral-900) line-clamp-1">{item.name}</p>
                        <p className="font-dm text-[12px] text-(--neutral-400)">
                          {formatKes(item.priceKes)} × {item.quantity}
                        </p>
                      </div>
                      <p className="font-dm text-[13px] font-semibold text-(--neutral-900) whitespace-nowrap">
                        KES {subtotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Price summary */}
              <div className="mt-4 bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200) flex flex-col gap-2">
                <div className="flex justify-between font-dm text-[13px] text-(--neutral-500)">
                  <span>Subtotal</span>
                  <span>{formatKes(order.subtotalKes)}</span>
                </div>
                <div className="flex justify-between font-dm text-[13px] text-(--neutral-500)">
                  <span>Delivery</span>
                  <span>{order.deliveryKes ? formatKes(order.deliveryKes) : "Free"}</span>
                </div>
                {order.discountKes > 0 && (
                  <div className="flex justify-between font-dm text-[13px] text-(--success)">
                    <span>Discount</span>
                    <span>-{formatKes(order.discountKes)}</span>
                  </div>
                )}
                <div className="h-px bg-(--neutral-200) my-1" />
                <div className="flex justify-between font-syne text-[16px] font-semibold text-(--neutral-900)">
                  <span>Total</span>
                  <span>{formatKes(order.totalKes)}</span>
                </div>
              </div>
            </div>

            {/* Shipping address */}
            {order.deliveryType === "DELIVERY" && (order.deliveryAddress || order.deliveryCity) && (
              <div>
                <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Shipping Address</p>
                <div className="flex items-start gap-2 bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
                  <MapPin size={15} className="text-(--neutral-400) shrink-0 mt-0.5" />
                  <div className="font-dm text-[13px] text-(--neutral-700)">
                    {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
                    {order.deliveryCity && <p>{order.deliveryCity}{order.deliveryCounty ? `, ${order.deliveryCounty}` : ""}</p>}
                    {order.deliveryPhone && <p className="text-(--neutral-500) mt-0.5">{order.deliveryPhone}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Staff note */}
            <div>
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Staff Note</p>
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a staff note (visible to admin only)…"
                className="w-full font-dm text-[13px] text-(--neutral-900) rounded-[8px] border border-(--neutral-200) bg-white px-3 py-2 focus:outline-none focus:border-(--green-800) resize-none transition-colors placeholder:text-(--neutral-400)"
              />
            </div>
          </div>

          {/* ── Right 40% ── */}
          <div className="w-[180px] shrink-0 flex flex-col gap-4">

            {/* Customer card */}
            <div className="bg-(--neutral-50) rounded-[10px] p-3 border border-(--neutral-200)">
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Customer</p>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-(--green-50) flex items-center justify-center shrink-0">
                  <span className="font-syne text-[11px] font-bold text-(--green-800)">
                    {getInitials(order.user?.name ?? order.guestEmail)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-dm text-[12px] font-medium text-(--neutral-900) truncate">
                    {order.user?.name ?? "Guest"}
                  </p>
                  <p className="font-dm text-[11px] text-(--neutral-400) truncate">
                    {order.user?.email ?? order.guestEmail ?? "—"}
                  </p>
                </div>
              </div>
              {order.user && (
                <a
                  href={`/admin/customers`}
                  className="font-dm text-[11px] text-(--green-800) hover:underline flex items-center gap-1"
                >
                  <User size={11} /> View customer
                </a>
              )}
            </div>

            {/* Payment card */}
            <div className="bg-(--neutral-50) rounded-[10px] p-3 border border-(--neutral-200)">
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Payment</p>
              <div className="flex items-center gap-1.5 mb-1.5">
                <CreditCard size={13} className="text-(--neutral-400)" />
                <span className="font-dm text-[12px] text-(--neutral-700)">M-Pesa</span>
              </div>
              <StatusPill status={order.paymentStatus.toLowerCase()} />
              <p className="font-dm text-[13px] font-semibold text-(--neutral-900) mt-2">
                {formatKes(order.totalKes)}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
                <button
                  onClick={() => updateStatus.mutate({ id: order.id, status: "SHIPPED" })}
                  disabled={updateStatus.isPending || order.status === "SHIPPED"}
                  className="w-full h-9 rounded-[8px] bg-(--green-800) font-dm text-[12px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {updateStatus.isPending ? <Spinner size={12} /> : <Truck size={13} />}
                  Mark Shipped
                </button>
              )}
              <button
                onClick={() => { window.print(); }}
                className="w-full h-9 rounded-[8px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer size={13} /> Print Invoice
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/orders/${order.id}`);
                  toast.success("Order link copied");
                }}
                className="w-full h-9 rounded-[8px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center justify-center gap-1.5 transition-colors"
              >
                <Link2 size={13} /> Copy Link
              </button>

              {order.status !== "CANCELLED" && (
                <>
                  <div className="h-px bg-(--neutral-200) my-1" />
                  <button
                    onClick={() => setCancelConfirmOpen(true)}
                    className="w-full h-9 rounded-[8px] font-dm text-[12px] text-(--danger) hover:bg-(--danger-bg) flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <X size={13} /> Cancel Order
                  </button>
                </>
              )}
            </div>

            {/* Date info */}
            <div className="font-dm text-[11px] text-(--neutral-400)">
              <p>Placed {formatDate(order.createdAt)}</p>
              {order.deliveryType && (
                <p className="mt-0.5">{order.deliveryType === "PICKUP" ? "Pickup order" : "Delivery order"}</p>
              )}
            </div>
          </div>
        </div>
      </Drawer>

      <ConfirmModal
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={() => {
          updateStatus.mutate({ id: order.id, status: "CANCELLED" });
          setCancelConfirmOpen(false);
        }}
        title="Cancel this order?"
        description="This will mark the order as cancelled. The customer will need to be notified separately."
        confirmLabel="Cancel Order"
        danger
        loading={updateStatus.isPending}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminOrdersClient() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | OrderStatus>("");
  const [branchFilter, setBranchFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Data query ──
  const { data, isLoading } = useQuery<{ ok: boolean; data: { orders: AdminOrder[]; scope: { isSuperAdmin: boolean; branchId: string | null } } }>({
    queryKey: ["admin-orders", branchFilter],
    queryFn: () => fetch(`/api/admin/orders${branchFilter ? `?branchId=${encodeURIComponent(branchFilter)}` : ""}`).then((r) => r.json()),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const liveOrders = query.state.data?.data?.orders ?? [];
      return liveOrders.some((order) => order.paymentStatus === "PENDING" || order.status === "PENDING") ? 15_000 : false;
    },
  });

  const branchesQuery = useQuery<{ ok: boolean; data: { branches: { id: string; name: string; county: string }[] } }>({
    queryKey: ["branches"],
    queryFn: () => fetch("/api/branches").then((r) => r.json()),
  });

  const orders: AdminOrder[] = data?.data?.orders ?? [];
  const scope = data?.data?.scope;
  const branches = branchesQuery.data?.data?.branches ?? [];

  // ── Stats ──
  const todayOrders = orders.filter((o) => isToday(o.createdAt)).length;
  const processingOrders = orders.filter((o) => o.status === "PROCESSING").length;
  const shippedOrders = orders.filter((o) => o.status === "SHIPPED").length;
  const deliveredThisMonth = orders.filter((o) => o.status === "DELIVERED" && isThisMonth(o.createdAt)).length;

  // ── Filtered list ──
  const filtered = orders.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const customer = o.user?.name ?? o.guestEmail ?? "";
      if (!o.id.toLowerCase().includes(q) && !customer.toLowerCase().includes(q) && !(o.user?.email ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function openOrderDetail(order: AdminOrder) {
    setSelectedOrder(order);
    setDrawerOpen(true);
  }

  // ── Table columns ──
  const columns = [
    {
      key: "id",
      label: "Order ID",
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        return (
          <span className="font-dm text-[13px] font-semibold text-(--neutral-900) font-mono">
            {shortId(o.id)}
          </span>
        );
      },
    },
    {
      key: "user",
      label: "Customer",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        return o.user ? (
          <div>
            <p className="font-dm text-[13px] font-medium text-(--neutral-900)">{o.user.name}</p>
            <p className="font-dm text-[11px] text-(--neutral-400)">{o.user.email}</p>
          </div>
        ) : (
          <span className="font-dm text-[13px] text-(--neutral-400)">{o.guestEmail ?? "Guest"}</span>
        );
      },
    },
    {
      key: "items",
      label: "Items",
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        const qty = o.items.reduce((s, i) => s + i.quantity, 0);
        return <span className="font-dm text-[13px] text-(--neutral-700)">{qty} item{qty !== 1 ? "s" : ""}</span>;
      },
    },
    {
      key: "totalKes",
      label: "Total",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        return <span className="font-dm text-[13px] font-semibold text-(--neutral-900)">{formatKes(o.totalKes)}</span>;
      },
    },
    {
      key: "status",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        return <StatusPill status={o.status.toLowerCase()} />;
      },
    },
    {
      key: "paymentStatus",
      label: "Payment",
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        return <StatusPill status={o.paymentStatus === "PAID" ? "paid" : o.paymentStatus.toLowerCase()} />;
      },
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        return <span className="font-dm text-[12px] text-(--neutral-400)">{formatDate(o.createdAt)}</span>;
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); openOrderDetail(o); }}
            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-(--neutral-400) hover:bg-(--neutral-100) transition-colors"
          >
            <MoreHorizontal size={15} />
          </button>
        );
      },
    },
  ];

  const ALL_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

  return (
    <div className="min-h-screen">
      <PageHeader title="Orders" description="Manage customer orders and fulfillment" />

      {/* ── Stat cards ── */}
      <div className="px-6 mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard eyebrow="Today's Orders" value={String(todayOrders)} icon={ShoppingBag} />
        <StatCard eyebrow="Processing" value={String(processingOrders)} icon={Clock} />
        <StatCard eyebrow="Shipped" value={String(shippedOrders)} icon={Truck} />
        <StatCard eyebrow="Delivered This Month" value={String(deliveredThisMonth)} icon={CheckCircle} />
      </div>

      {/* ── Filter toolbar ── */}
      <div className="px-6 mb-5 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative w-[280px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order ID or customer…"
            className="w-full h-9 pl-9 pr-3 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-900) bg-white focus:outline-none focus:border-(--green-800) placeholder:text-(--neutral-400) transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) hover:text-(--neutral-700)">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | OrderStatus)}
            className="h-9 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) bg-white focus:outline-none focus:border-(--green-800) appearance-none cursor-pointer"
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
        </div>

        {scope?.isSuperAdmin && (
          <div className="relative">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) bg-white focus:outline-none focus:border-(--green-800) appearance-none cursor-pointer"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name} - {branch.county}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
          </div>
        )}

        {!isLoading && (
          <span className="font-dm text-[13px] text-(--neutral-400)">
            {filtered.length} order{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Export button */}
        <button
          onClick={() => toast.info("Export coming soon")}
          className="ml-auto h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center gap-2 transition-colors"
        >
          <Download size={14} /> Export
        </button>
      </div>

      {/* ── Table ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="px-6"
      >
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          loading={isLoading}
          onRowClick={(row) => openOrderDetail(row as unknown as AdminOrder)}
          emptyTitle="No orders found"
          emptyDescription="Orders placed through the storefront will appear here."
          pageSize={25}
        />
      </motion.div>

      {/* ── Order detail drawer ── */}
      <OrderDetailDrawer
        order={selectedOrder}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setTimeout(() => setSelectedOrder(null), 250); }}
      />
    </div>
  );
}
