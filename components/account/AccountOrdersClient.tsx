"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountLayout } from "@/components/account/AccountLayout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

interface OrderItem {
  id: string;
  productId: string;
  name: string;
  priceKes: number;
  quantity: number;
  imageUrl: string | null;
}

interface Order {
  id: string;
  status: OrderStatus;
  paymentStatus: string;
  subtotalKes: number;
  deliveryKes: number;
  discountKes: number;
  totalKes: number;
  promoCode: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function truncateId(id: string): string {
  return id.replace(/-/g, "").slice(-8).toUpperCase();
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING:
    "bg-[#fec700]/20 text-[#7a5f00]",
  CONFIRMED:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PROCESSING:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  SHIPPED:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  DELIVERED:
    "bg-green-100 text-[#27731e] dark:bg-green-900/30 dark:text-[#a4f690]",
  CANCELLED:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={[
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold",
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600",
      ].join(" ")}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Product thumbnails (up to 3, overlapping)
// ---------------------------------------------------------------------------

function OrderThumbnails({ items }: { items: OrderItem[] }) {
  const shown = items.slice(0, 3);

  if (shown.length === 0 || shown.every((i) => !i.imageUrl)) {
    // Placeholder when no images
    return (
      <div className="w-10 h-10 rounded-[8px] bg-[#f0fdf4] flex items-center justify-center shrink-0">
        <Icon icon="mdi:cart-outline" width={20} className="text-[#27731e]" />
      </div>
    );
  }

  return (
    <div className="flex -space-x-2 shrink-0">
      {shown.map((item, idx) =>
        item.imageUrl ? (
          <div
            key={item.id}
            className="relative w-10 h-10 rounded-[8px] border-2 border-white dark:border-gray-900 overflow-hidden bg-gray-100 dark:bg-gray-800"
            style={{ zIndex: shown.length - idx }}
          >
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
        ) : (
          <div
            key={item.id}
            className="w-10 h-10 rounded-[8px] border-2 border-white dark:border-gray-900 bg-[#f0fdf4] flex items-center justify-center"
            style={{ zIndex: shown.length - idx }}
          >
            <Icon icon="mdi:leaf" width={16} className="text-[#27731e]" />
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order card
// ---------------------------------------------------------------------------

function OrderCard({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const markDelivered = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${order.id}/delivered`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update order");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-orders"] });
    },
    onError: (e: Error) => {
      console.error("[AccountOrders] markDelivered failed:", e.message);
    },
  });

  function handleMarkDelivered() {
    if (!window.confirm("Mark this order as delivered?")) return;
    markDelivered.mutate();
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-[16px] border border-[#e2e2e2] dark:border-gray-700 mb-3 overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-150"
        aria-expanded={expanded}
      >
        {/* Thumbnails */}
        <OrderThumbnails items={order.items} />

        {/* Order meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-[#1a1c1c] dark:text-white">
              Order #{truncateId(order.id)}
            </span>
            <span className="text-[13px] text-[#40493c] dark:text-gray-400">
              {formatDate(order.createdAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
            <span className="text-[13px] text-[#40493c] dark:text-gray-400">
              {order.items.length} {order.items.length === 1 ? "item" : "items"}
            </span>
            <span className="text-[14px] font-bold text-[#1a1c1c] dark:text-white">
              {formatKes(order.totalKes)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={order.status} />
            {order.status === "SHIPPED" && (
              <button
                onClick={(e) => { e.stopPropagation(); handleMarkDelivered(); }}
                disabled={markDelivered.isPending}
                className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                {markDelivered.isPending ? "Updating…" : "Mark as Delivered"}
              </button>
            )}
          </div>
        </div>

        {/* Chevron */}
        <Icon
          icon="mdi:chevron-right"
          width={20}
          className={[
            "text-[#40493c] dark:text-gray-400 shrink-0 transition-transform duration-200",
            expanded ? "rotate-90" : "rotate-0",
          ].join(" ")}
        />
      </button>

      {/* Expanded items list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#e2e2e2] dark:border-gray-700 px-4 py-3 flex flex-col gap-2.5">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  {item.imageUrl ? (
                    <div className="relative w-10 h-10 rounded-[6px] overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0">
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-[6px] bg-[#f0fdf4] flex items-center justify-center shrink-0">
                      <Icon icon="mdi:leaf" width={16} className="text-[#27731e]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#1a1c1c] dark:text-white truncate">
                      {item.name}
                    </p>
                    <p className="text-[13px] text-[#40493c] dark:text-gray-400">
                      Qty {item.quantity} &times; {formatKes(item.priceKes)}
                    </p>
                  </div>
                  <p className="text-[14px] font-semibold text-[#1a1c1c] dark:text-white shrink-0">
                    {formatKes(item.priceKes * item.quantity)}
                  </p>
                </div>
              ))}

              {/* Order total breakdown */}
              <div className="border-t border-[#e2e2e2] dark:border-gray-700 pt-2.5 mt-1 space-y-1">
                <div className="flex justify-between text-[13px] text-[#40493c] dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>{formatKes(order.subtotalKes)}</span>
                </div>
                <div className="flex justify-between text-[13px] text-[#40493c] dark:text-gray-400">
                  <span>Delivery</span>
                  <span>{formatKes(order.deliveryKes)}</span>
                </div>
                {order.discountKes > 0 && (
                  <div className="flex justify-between text-[13px] text-green-600 dark:text-green-400">
                    <span>
                      Discount{order.promoCode ? ` (${order.promoCode})` : ""}
                    </span>
                    <span>-{formatKes(order.discountKes)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[15px] font-bold text-[#1a1c1c] dark:text-white pt-1">
                  <span>Total</span>
                  <span>{formatKes(order.totalKes)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function OrderSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-[16px] border border-[#e2e2e2] dark:border-gray-700 mb-3 p-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-[8px]" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * AccountOrdersClient
 *
 * Fetches orders via GET /api/orders (TanStack Query) and renders
 * expandable horizontal order cards with product thumbnails.
 */
export function AccountOrdersClient() {
  const { data, isLoading, isError } = useQuery<{
    ok: boolean;
    data: { orders: Order[] };
  }>({
    queryKey: ["account-orders"],
    queryFn: () => fetch("/api/orders").then((r) => r.json()),
    staleTime: 30_000,
  });

  const orders = data?.data?.orders ?? [];

  return (
    <AccountLayout>
      <div className="px-4 md:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-heading font-bold text-[28px] text-[#1a1c1c] dark:text-white">
            My Orders
          </h1>
          <p className="text-[#40493c] dark:text-gray-400 text-[15px] mt-1">
            View your order history and status updates.
          </p>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div>
            {Array.from({ length: 3 }).map((_, i) => (
              <OrderSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="text-center py-16 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <Icon icon="mdi:alert-circle-outline" width={32} className="text-red-500" />
            </div>
            <p className="text-[#1a1c1c] dark:text-white font-semibold text-[18px]">
              Could not load orders
            </p>
            <p className="text-[#40493c] dark:text-gray-400 text-[14px]">
              Please refresh the page or try again later.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && orders.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="text-center py-20 flex flex-col items-center gap-5"
          >
            <div className="w-24 h-24 bg-[#f0fdf4] dark:bg-green-900/20 rounded-full flex items-center justify-center">
              <Icon
                icon="mdi:receipt-outline"
                width={48}
                className="text-[#27731e]"
              />
            </div>
            <h2 className="font-heading text-[#1a1c1c] dark:text-white text-[24px] font-semibold">
              No orders yet
            </h2>
            <p className="text-[#40493c] dark:text-gray-400 text-[15px] max-w-[300px]">
              You haven&apos;t placed any orders. Start browsing our products.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-[#27731e] hover:bg-[#045a03] text-white rounded-full px-8 py-3.5 font-semibold text-[14px] transition-colors duration-150 mt-1"
            >
              Start Shopping
              <Icon icon="mdi:arrow-right" width={16} />
            </Link>
          </motion.div>
        )}

        {/* Order list */}
        {!isLoading && !isError && orders.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </motion.div>
        )}
      </div>
    </AccountLayout>
  );
}
