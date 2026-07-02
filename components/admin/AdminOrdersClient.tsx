"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ShoppingBag, Clock, Truck, CheckCircle, Search, Download,
  ChevronDown, MoreHorizontal, X, Tag, User, CreditCard, Printer, Link2,
  MapPin, Check, Copy,
} from "lucide-react";
import { StatsCard } from "@/components/ui/stats-card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import CheckboxGreen from "@/components/ui/CheckboxGreen";
import { PrelineSelect } from "@/components/admin/ui/PrelineSelect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "WAITING_TO_PACKAGE" | "READY_FOR_PICKUP" | "PICKED_UP" | "FAILED";
type PaymentStatus = "PENDING" | "PAID" | "FAILED";

type OrderItemDetail = {
  id: string;
  name: string;
  quantity: number;
  priceKes: number;
  product?: {
    name: string;
    images: { objectKey: string; isPrimary?: boolean }[];
  };
};

type AdminOrder = {
  id: string;
  status: OrderStatus;
  orderNumber: string | null;
  processingBy: string | null;
  processedAt: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  shippedAt: string | null;
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
  branch: { id: string; name: string; county: string; phone: string | null } | null;
  items: OrderItemDetail[];
  transactions: { provider: "MPESA" | "PAYSTACK" | "KCB" }[];
  customerPickupConfirmedAt: string | null;
  staffPickupConfirmedAt: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Placed", CONFIRMED: "Confirmed", PROCESSING: "Processing",
  SHIPPED: "Shipped", DELIVERED: "Delivered", CANCELLED: "Cancelled",
  WAITING_TO_PACKAGE: "Packaging",
  READY_FOR_PICKUP: "Ready for Pickup",
  PICKED_UP: "Picked Up",
  FAILED: "Failed",
};

const PROVIDER_LABELS: Record<string, string> = { MPESA: "M-Pesa", PAYSTACK: "Paystack", KCB: "KCB Buni" };

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
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
  const images = item.product?.images ?? [];
  const img = images.find((i) => i.isPrimary) ?? images[0];
  const key = img?.objectKey;
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  if (key.startsWith("/")) return key;
  if (key.startsWith("img/")) return `/${key}`;
  if (!R2_BASE) return `/${key}`;
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
// ConfirmModal2 — order number verification gate before confirmation
// ---------------------------------------------------------------------------
function ConfirmOrderModal({
  order,
  open,
  onClose,
  onConfirm,
  loading,
}: {
  order: AdminOrder | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (orderNumber: string) => void;
  loading: boolean;
}) {
  const [typedNumber, setTypedNumber] = useState("");

  if (!order || !open) return null;

  const orderNum = order.orderNumber ?? "";
  const isMatch = typedNumber.trim() === orderNum;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isMatch) onConfirm(typedNumber.trim());
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-(--dark-surface) rounded-[16px] w-full max-w-[420px] mx-4 shadow-xl p-6">
        <h3 className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-2">
          Confirm Order
        </h3>
        <p className="font-dm text-[13px] text-(--neutral-500) mb-4">
          Type the order number below to confirm you have the correct order.
        </p>

        {/* Order number highlighted box */}
        <div className="flex items-center gap-2 bg-(--neutral-50) border border-(--neutral-200) rounded-[10px] px-4 py-3 mb-4">
          <span className="font-mono text-[16px] font-bold text-(--neutral-900) flex-1">{orderNum}</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(orderNum);
              toast.success("Copied");
            }}
            className="text-(--neutral-400) hover:text-(--neutral-700) transition-colors"
            title="Copy order number"
          >
            <Copy size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            type="text"
            placeholder="Type order number to confirm"
            value={typedNumber}
            onChange={(e) => setTypedNumber(e.target.value)}
            className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-300) font-dm text-[14px] text-(--neutral-900) outline-none focus:border-(--green-600) transition-colors placeholder:text-(--neutral-400)"
          />

          <div className="flex gap-2 justify-end mt-1">
            <button
              type="button"
              onClick={() => { onClose(); setTypedNumber(""); }}
              className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isMatch || loading}
              className="h-9 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:bg-(--green-900) transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {loading ? <Spinner size={12} /> : null}
              Confirm Order
            </button>
          </div>
        </form>
      </div>
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
  const [confirmModal1Open, setConfirmModal1Open] = useState(false);
  const [confirmModal2Open, setConfirmModal2Open] = useState(false);
  const [pendingGateAction, setPendingGateAction] = useState<"set_processing" | "set_packaging" | null>(null);
  const [noteText, setNoteText] = useState("");

  // Generic fulfillment PATCH — used by processing toggle and ship button
  const fulfillMutation = useMutation({
    mutationFn: async ({ id, action, orderNumber }: { id: string; action: string; orderNumber?: string }) => {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(orderNumber ? { orderNumber } : {}) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Update failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;

  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const isConfirmed = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status);
  const isProcessed = !!order.processingBy && ["PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status);

  function handleFulfillment(action: string, orderNumber?: string) {
    fulfillMutation.mutate({ id: order!.id, action, orderNumber });
  }

  return (
    <>
      <Drawer open={open} onClose={onClose} title={`Order ${order.orderNumber ?? shortId(order.id)}`} width={640} footer={null}>
        <div className="flex gap-6">
          {/* ── Left ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">

            {/* Order number */}
            <div className="flex items-center gap-2">
              <span className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px]">Order Number</span>
              {order.orderNumber ? (
                <div className="flex items-center gap-1.5 bg-(--neutral-100) px-3 py-1 rounded-full">
                  <span className="font-mono text-[13px] font-semibold text-(--neutral-900)">{order.orderNumber}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(order.orderNumber!);
                      toast.success("Copied");
                    }}
                    className="text-(--neutral-400) hover:text-(--neutral-700) transition-colors"
                    title="Copy"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              ) : (
                <span className="font-dm text-[13px] text-(--neutral-400) italic">Will be assigned on confirmation</span>
              )}
            </div>

            {/* Fulfillment panel */}
            <div
              className={`bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200) ${
                order.status === "FAILED" || order.status === "CANCELLED" ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-4">Fulfillment</p>

              <div className="flex flex-col gap-4">
                {/* Step 1: Confirmed — read-only indicator, driven by payment webhook */}
                <div className="flex items-center gap-3">
                  <CheckboxGreen
                    checked={isConfirmed}
                    onChange={() => {}}
                    disabled
                  />
                  <div>
                    <p className="font-dm text-[14px] font-medium text-(--neutral-900)">Confirmed</p>
                    {order.status === "FAILED" ? (
                      <p className="font-dm text-[12px] text-(--danger)">Payment failed — order not confirmed</p>
                    ) : isConfirmed ? (
                      <p className="font-dm text-[12px] text-(--neutral-500)">Confirmed at {formatDate(order.confirmedAt)}</p>
                    ) : (
                      <p className="font-dm text-[12px] text-(--neutral-400)">Awaiting payment confirmation</p>
                    )}
                  </div>
                </div>

                {order.deliveryType === "PICKUP" ? (
                  <>
                    {/* PICKUP: Step 2 — Prepare Package */}
                    <div className="flex items-center gap-3">
                      <CheckboxGreen
                        checked={["WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP"].includes(order.status)}
                        onChange={() => {
                          if (!["WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP"].includes(order.status)) {
                            setPendingGateAction("set_packaging");
                            setConfirmModal1Open(true);
                          }
                        }}
                        disabled={fulfillMutation.isPending || !isConfirmed || ["WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP", "CANCELLED"].includes(order.status)}
                      />
                      <div>
                        <p className="font-dm text-[14px] font-medium text-(--neutral-900)">Prepare Package</p>
                        <p className="font-dm text-[12px] text-(--neutral-400)">
                          {["WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP"].includes(order.status) ? "Package preparation started" : "Start preparing the customer's package"}
                        </p>
                      </div>
                    </div>

                    {/* PICKUP: Step 3 — Ready for Pickup button */}
                    <div className="flex items-center gap-3 pl-[52px]">
                      <button
                        disabled={order.status !== "WAITING_TO_PACKAGE" || fulfillMutation.isPending}
                        onClick={() => {
                          if (window.confirm("Mark this order as ready for pickup?")) {
                            handleFulfillment("set_ready");
                          }
                        }}
                        className="px-4 py-2 text-[13px] font-medium rounded-[8px] bg-amber-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-600 transition-colors flex items-center gap-1.5"
                      >
                        {fulfillMutation.isPending ? <Spinner size={12} /> : <MapPin size={13} />}
                        Ready for Pickup
                      </button>
                    </div>

                    {/* PICKUP: Step 4 — dual pickup confirmation (staff + customer) */}
                    {order.status === "READY_FOR_PICKUP" && order.staffPickupConfirmedAt ? (
                      <div className="flex items-center gap-3 pl-[52px]">
                        <div className="bg-(--neutral-50) border border-(--neutral-200) rounded-[8px] px-3 py-2 flex items-center gap-2">
                          <Clock size={14} className="text-(--neutral-400) shrink-0" />
                          <p className="font-dm text-[12px] text-(--neutral-500)">
                            Staff confirmed handover — waiting for customer to confirm pickup
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 pl-[52px]">
                        <button
                          disabled={order.status !== "READY_FOR_PICKUP" || fulfillMutation.isPending}
                          onClick={() => {
                            if (window.confirm("Confirm you have handed over this order to the customer?")) {
                              handleFulfillment("set_picked_up");
                            }
                          }}
                          className="px-4 py-2 text-[13px] font-medium rounded-[8px] bg-[#15803D] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#16A34A] transition-colors flex items-center gap-1.5"
                        >
                          {fulfillMutation.isPending ? <Spinner size={12} /> : <Check size={13} />}
                          Confirm Pickup (Staff)
                        </button>
                      </div>
                    )}

                    {/* PICKUP: Final state */}
                    {order.status === "PICKED_UP" && (
                      <div className="flex items-center gap-2 text-[#15803D]">
                        <CheckCircle size={16} />
                        <p className="font-dm text-[13px] font-semibold">Order picked up</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* DELIVERY: Step 2 — Processing */}
                    <div className="flex items-center gap-3">
                      <CheckboxGreen
                        checked={isProcessed}
                        onChange={() => {
                          if (isProcessed) {
                            handleFulfillment("unset_processing");
                          } else {
                            setPendingGateAction("set_processing");
                            setConfirmModal1Open(true);
                          }
                        }}
                        disabled={fulfillMutation.isPending || !isConfirmed || ["SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status)}
                      />
                      <div>
                        <p className="font-dm text-[14px] font-medium text-(--neutral-900)">Processing</p>
                        {isProcessed ? (
                          <p className="font-dm text-[12px] text-(--neutral-500)">Packaging started {formatDate(order.processedAt)}</p>
                        ) : (
                          <p className="font-dm text-[12px] text-(--neutral-400)">Waiting to be packaged / shipped</p>
                        )}
                      </div>
                    </div>

                    {/* DELIVERY: Step 3 — Ship button */}
                    <div className="flex items-center gap-3 pl-[52px]">
                      <button
                        disabled={order.status !== "PROCESSING" || fulfillMutation.isPending}
                        onClick={() => {
                          if (window.confirm("Mark this order as shipped?")) {
                            handleFulfillment("ship");
                          }
                        }}
                        className="px-4 py-2 text-[13px] font-medium rounded-[8px] bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                      >
                        {fulfillMutation.isPending ? <Spinner size={12} /> : <Truck size={13} />}
                        Mark Shipped
                      </button>
                    </div>

                    {/* DELIVERY: Step 4 — Delivered indicator */}
                    <div className="flex items-center gap-3 opacity-70">
                      <div className="w-10 h-10 rounded-full border-2 border-dashed border-(--neutral-300) flex items-center justify-center shrink-0">
                        {order.status === "DELIVERED"
                          ? <Check className="w-5 h-5 text-green-500" />
                          : <span className="text-[11px] text-(--neutral-400)">—</span>
                        }
                      </div>
                      <p className="font-dm text-[13px] text-(--neutral-500)">
                        {order.status === "SHIPPED" ? "Awaiting customer confirmation" : order.status === "DELIVERED" ? "Delivered" : "Not shipped yet"}
                      </p>
                    </div>
                  </>
                )}
              </div>
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

            {/* Shipping address or store pickup */}
            {order.deliveryType === "DELIVERY" ? (
              <div>
                <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Shipping Address</p>
                {(order.deliveryAddress || order.deliveryCity) && (
                  <div className="flex items-start gap-2 bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
                    <MapPin size={15} className="text-(--neutral-400) shrink-0 mt-0.5" />
                    <div className="font-dm text-[13px] text-(--neutral-700)">
                      {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
                      {order.deliveryCity && <p>{order.deliveryCity}{order.deliveryCounty ? `, ${order.deliveryCounty}` : ""}</p>}
                      {order.deliveryPhone && <p className="text-(--neutral-500) mt-0.5">{order.deliveryPhone}</p>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Store Pickup</p>
                <div className="flex items-start gap-2 bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
                  <MapPin size={15} className="text-(--neutral-400) shrink-0 mt-0.5" />
                  <div className="font-dm text-[13px] text-(--neutral-700)">
                    <p>Customer will collect from store{order.branch?.name ? ` — ${order.branch.name}` : ""}</p>
                    {order.branch?.phone && <p className="text-(--neutral-500) mt-0.5">{order.branch.phone}</p>}
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
                  href="/admin/customers"
                  className="font-dm text-[11px] text-(--green-800) hover:underline flex items-center gap-1"
                >
                  <User size={11} /> View customer
                </a>
              )}
            </div>

            {/* Delivery method */}
            <div className="bg-(--neutral-50) rounded-[10px] p-3 border border-(--neutral-200)">
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Delivery</p>
              {order.deliveryType === "PICKUP" ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  Store Pickup
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
                  Home Delivery
                </span>
              )}
            </div>

            {/* Payment card */}
            <div className="bg-(--neutral-50) rounded-[10px] p-3 border border-(--neutral-200)">
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Payment</p>
              <div className="flex items-center gap-1.5 mb-1.5">
                <CreditCard size={13} className="text-(--neutral-400)" />
                <span className="font-dm text-[12px] text-(--neutral-700)">
                  {PROVIDER_LABELS[order.transactions?.[0]?.provider ?? ""] ?? "—"}
                </span>
              </div>
              <StatusPill
                status={
                  order.status === "FAILED" || order.status === "CANCELLED"
                    ? "failed"
                    : order.paymentStatus === "PAID" ? "paid" : order.paymentStatus.toLowerCase()
                }
              />
              <p className="font-dm text-[13px] font-semibold text-(--neutral-900) mt-2">
                {formatKes(order.totalKes)}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { window.open(`/api/admin/orders/${order.id}/invoice`, "_blank"); }}
                disabled={order.status === "FAILED" || order.status === "CANCELLED" || order.paymentStatus !== "PAID"}
                className="w-full h-9 rounded-[8px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer size={13} /> Print Invoice
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/account/orders/${encodeURIComponent(order.orderNumber ?? order.id)}`);
                  toast.success("Order link copied");
                }}
                disabled={order.status === "FAILED" || order.status === "CANCELLED"}
                className="w-full h-9 rounded-[8px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Link2 size={13} /> Copy Link
              </button>

              {["PENDING", "CONFIRMED", "PROCESSING", "WAITING_TO_PACKAGE"].includes(order.status) && (
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

      {/* Cancel confirm */}
      <ConfirmModal
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={() => {
          handleFulfillment("cancel");
          setCancelConfirmOpen(false);
        }}
        title="Cancel this order?"
        description="This will mark the order as cancelled. The customer will need to be notified separately."
        confirmLabel="Cancel Order"
        danger
        loading={fulfillMutation.isPending}
      />

      {/* Confirm step 1 — are you sure? (shared by set_processing / set_packaging gates) */}
      <ConfirmModal
        open={confirmModal1Open}
        onClose={() => { setConfirmModal1Open(false); setPendingGateAction(null); }}
        onConfirm={() => {
          setConfirmModal1Open(false);
          setConfirmModal2Open(true);
        }}
        title="Proceed with this order?"
        description="Are you sure you want to proceed? You will need to enter the order number to continue."
        confirmLabel="Yes, continue"
        loading={false}
      />

      {/* Confirm step 2 — order number verification gate */}
      <ConfirmOrderModal
        order={order}
        open={confirmModal2Open}
        onClose={() => { setConfirmModal2Open(false); setPendingGateAction(null); }}
        onConfirm={(orderNumber) => {
          setConfirmModal2Open(false);
          if (pendingGateAction) handleFulfillment(pendingGateAction, orderNumber);
          setPendingGateAction(null);
        }}
        loading={fulfillMutation.isPending}
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

  // Drawer must reflect live order state after mutations (invalidation refetches the list,
  // but `selectedOrder` itself is a frozen snapshot from click-time) — always render the live lookup.
  const liveSelectedOrder = orders.find((o) => o.id === selectedOrder?.id) ?? selectedOrder;

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
      if (
        !o.id.toLowerCase().includes(q) &&
        !customer.toLowerCase().includes(q) &&
        !(o.user?.email ?? "").toLowerCase().includes(q) &&
        !(o.orderNumber ?? "").toLowerCase().includes(q)
      ) return false;
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
      label: "Order",
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        return (
          <div>
            <span className="font-dm text-[13px] font-semibold text-(--neutral-900) font-mono">
              {o.orderNumber ?? shortId(o.id)}
            </span>
          </div>
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
      key: "deliveryType",
      label: "Delivery",
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = row as unknown as AdminOrder;
        if (o.deliveryType === "PICKUP") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              Store Pickup
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
            Home Delivery
          </span>
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

  const ALL_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP", "FAILED"];

  return (
    <div className="min-h-screen">
      <PageHeader title="Orders" description="Manage customer orders and fulfillment" />

      {/* ── Stat cards ── */}
      <div className="px-6 mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Today's Orders" value={String(todayOrders)} icon={<ShoppingBag className="h-4 w-4 text-muted-foreground" />} change="—" changeType="positive" />
        <StatsCard title="Processing" value={String(processingOrders)} icon={<Clock className="h-4 w-4 text-muted-foreground" />} change="—" changeType="positive" />
        <StatsCard title="Shipped" value={String(shippedOrders)} icon={<Truck className="h-4 w-4 text-muted-foreground" />} change="—" changeType="positive" />
        <StatsCard title="Delivered This Month" value={String(deliveredThisMonth)} icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />} change="—" changeType="positive" />
      </div>

      {/* ── Filter toolbar ── */}
      <div className="px-6 mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-[280px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order ID, number, or customer…"
            className="w-full h-9 pl-9 pr-3 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-900) bg-white focus:outline-none focus:border-(--green-800) placeholder:text-(--neutral-400) transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) hover:text-(--neutral-700)">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="w-[180px]">
          <PrelineSelect
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as "" | OrderStatus)}
            placeholder="All statuses"
            options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          />
        </div>

        {scope?.isSuperAdmin && (
          <div className="w-[200px]">
            <PrelineSelect
              value={branchFilter}
              onChange={setBranchFilter}
              placeholder="All branches"
              options={branches.map((branch) => ({ value: branch.id, label: `${branch.name} - ${branch.county}` }))}
            />
          </div>
        )}

        {!isLoading && (
          <span className="font-dm text-[13px] text-(--neutral-400)">
            {filtered.length} order{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

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
        order={liveSelectedOrder}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setTimeout(() => setSelectedOrder(null), 250); }}
      />
    </div>
  );
}
