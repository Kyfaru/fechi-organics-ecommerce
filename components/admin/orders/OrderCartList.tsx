"use client";

/**
 * OrderCartList — cart line items for the in-store order wizard's Products
 * step. Visually a sibling of components/cart/CartClient.tsx's line-item
 * rendering (image, name, quantity stepper, line total, remove button),
 * restyled with the admin design tokens (font-dm/font-syne, --neutral-*,
 * --green-800) instead of the storefront's raw hex palette.
 *
 * Purely presentational — the cart array lives in NewOrderClient as local
 * state; nothing here persists to the database until the order is submitted.
 */

import Image from "next/image";
import { ImageOff, Trash2 } from "lucide-react";

export interface OrderCartLine {
  productId: string;
  name: string;
  imageUrl: string | null;
  priceKes: number;
  quantity: number;
}

interface OrderCartListProps {
  items: OrderCartLine[];
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
}

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

export default function OrderCartList({ items, onIncrement, onDecrement, onRemove }: OrderCartListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-(--neutral-200) dark:border-(--dark-border) py-10 text-center">
        <p className="font-dm text-[13px] text-(--neutral-400)">
          No products added yet — search above to add items.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div
          key={item.productId}
          className="flex items-center gap-3 p-3 rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface)"
        >
          {/* Product image */}
          <div className="w-14 h-14 rounded-[8px] bg-(--neutral-100) dark:bg-(--dark-bg) shrink-0 overflow-hidden relative">
            {item.imageUrl ? (
              <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="56px" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-(--neutral-300)">
                <ImageOff size={18} />
              </div>
            )}
          </div>

          {/* Name + unit price */}
          <div className="flex-1 min-w-0">
            <p className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">
              {item.name}
            </p>
            <p className="font-dm text-[12px] text-(--neutral-400) mt-0.5">{formatKes(item.priceKes)} each</p>
          </div>

          {/* Quantity stepper */}
          <div className="flex items-center border border-(--neutral-200) dark:border-(--dark-border) rounded-[6px] overflow-hidden h-9 w-[96px] shrink-0">
            <button
              type="button"
              onClick={() => onDecrement(item.productId)}
              className="w-8 h-full flex items-center justify-center text-(--neutral-700) dark:text-(--dark-muted) text-[16px] hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg) transition-colors font-dm"
              aria-label={`Decrease quantity of ${item.name}`}
            >
              −
            </button>
            <span className="flex-1 text-center font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text)">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onIncrement(item.productId)}
              className="w-8 h-full flex items-center justify-center text-(--neutral-700) dark:text-(--dark-muted) text-[16px] hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg) transition-colors font-dm"
              aria-label={`Increase quantity of ${item.name}`}
            >
              +
            </button>
          </div>

          {/* Line total */}
          <span className="font-dm text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text) w-[96px] text-right shrink-0">
            {formatKes(item.priceKes * item.quantity)}
          </span>

          {/* Remove */}
          <button
            type="button"
            onClick={() => onRemove(item.productId)}
            className="shrink-0 p-2 text-(--neutral-400) hover:text-(--danger) transition-colors"
            aria-label={`Remove ${item.name}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
