"use client";

/**
 * OrderSummary — subtotal/discount/total + coupon code input for the
 * in-store order wizard's Products step.
 *
 * Coupon validation reuses GET /api/coupons/validate?code=...&subtotal=...
 * — the exact same endpoint and query shape components/checkout/DeliveryClient.tsx
 * already uses for the storefront checkout — no new discount logic lives
 * here. The actual fetch call is owned by NewOrderClient (it already has
 * subtotalKes from the cart state); this component is presentational and
 * just reports user intent (input changes, apply, remove) via callbacks.
 */

import { Loader2, Tag, X } from "lucide-react";

interface OrderSummaryProps {
  itemCount: number;
  subtotalKes: number;
  discountKes: number;
  totalKes: number;
  appliedCoupon: string | null;
  couponInput: string;
  onCouponInputChange: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  couponLoading: boolean;
  couponError: string | null;
}

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

export default function OrderSummary({
  itemCount,
  subtotalKes,
  discountKes,
  totalKes,
  appliedCoupon,
  couponInput,
  onCouponInputChange,
  onApplyCoupon,
  onRemoveCoupon,
  couponLoading,
  couponError,
}: OrderSummaryProps) {
  return (
    <div className="rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) p-4">
      <h3 className="font-syne text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-3">
        Order Summary
      </h3>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
          <span>
            Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})
          </span>
          <span>{formatKes(subtotalKes)}</span>
        </div>
        {appliedCoupon && (
          <div className="flex justify-between font-dm text-[13px] text-(--success)">
            <span className="flex items-center gap-1.5">
              <Tag size={12} /> {appliedCoupon}
            </span>
            <span>- {formatKes(discountKes)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-(--neutral-200) dark:border-(--dark-border) mt-3 pt-3 flex items-center justify-between">
        <span className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
          Total
        </span>
        <span className="font-syne text-[18px] font-bold text-(--green-800)">{formatKes(totalKes)}</span>
      </div>

      {/* Coupon code */}
      <div className="border-t border-(--neutral-200) dark:border-(--dark-border) mt-3 pt-3">
        <p className="font-dm text-[11px] font-semibold text-(--neutral-500) dark:text-(--dark-muted) uppercase tracking-[0.6px] mb-1.5">
          Coupon code
        </p>
        {appliedCoupon ? (
          <div className="flex items-center justify-between h-9 px-3 rounded-[6px] bg-(--green-50) dark:bg-green-900/20">
            <span className="font-dm text-[13px] font-medium text-(--green-800)">{appliedCoupon}</span>
            <button
              type="button"
              onClick={onRemoveCoupon}
              className="text-(--neutral-400) hover:text-(--danger) transition-colors"
              aria-label="Remove coupon"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={couponInput}
              onChange={(e) => onCouponInputChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && onApplyCoupon()}
              placeholder="ENTER CODE"
              disabled={couponLoading}
              className="flex-1 min-w-0 h-9 px-3 rounded-[6px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-bg) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) uppercase outline-none focus:border-(--green-800) placeholder:text-(--neutral-400) transition-colors disabled:opacity-60"
            />
            <button
              type="button"
              onClick={onApplyCoupon}
              disabled={couponLoading || !couponInput.trim()}
              className="h-9 px-4 rounded-[6px] bg-(--neutral-100) dark:bg-(--dark-bg) hover:bg-(--green-800) hover:text-white text-(--neutral-700) dark:text-(--dark-muted) font-dm text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
            >
              {couponLoading ? <Loader2 size={13} className="animate-spin" /> : "Apply"}
            </button>
          </div>
        )}
        {couponError && <p className="font-dm text-[11px] text-(--danger) mt-1.5">{couponError}</p>}
      </div>
    </div>
  );
}
