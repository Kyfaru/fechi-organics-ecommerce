"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@iconify/react";
import { Spinner } from "@/components/ui/spinner";
import { useCurrency } from "@/app/providers";
import type { CartLine } from "@/lib/cart";

type PlaceOrderResponse = {
  ok: boolean;
  data?: { orderId: string };
  error?: { code: string; message: string };
};

const DELIVERY_KES = 35000; // 350 × 100 cents

type CartResponse = {
  ok: boolean;
  data: {
    cartId: string;
    items: CartLine[];
    subtotalKes: number;
    itemCount: number;
  };
};

function StepIndicator() {
  const steps = [
    { num: 1, label: "Cart", active: true },
    { num: 2, label: "Delivery", active: false },
    { num: 3, label: "Payment", active: false },
  ];

  return (
    <div className="flex items-center justify-center w-full max-w-[540px] mx-auto relative">
      {/* Connector line */}
      <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-[#e2e2e2] z-0" />

      {steps.map((step, idx) => (
        <div key={step.num} className="flex-1 flex flex-col items-center relative z-10">
          <div
            className={[
              "w-10 h-10 rounded-full flex items-center justify-center border-2 font-body font-bold text-[18px]",
              step.active
                ? "bg-[#045a03] border-[#045a03] text-white"
                : "bg-white border-[#e2e2e2] text-[#707a6b]",
            ].join(" ")}
          >
            {step.num}
          </div>
          <span
            className={[
              "mt-2 font-body text-[13px]",
              step.active ? "text-[#045a03] font-bold" : "text-[#40493c]",
            ].join(" ")}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CartClient() {
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  // Place order mutation
  const orderMutation = useMutation<PlaceOrderResponse, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: appliedPromo }),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (res.ok && res.data?.orderId) {
        setPlacedOrderId(res.data.orderId);
        qc.invalidateQueries({ queryKey: ["cart"] });
      } else {
        toast.error(res.error?.message ?? "Could not place order");
      }
    },
    onError: () => {
      toast.error("Could not place order. Please try again.");
    },
  });

  const { data, isLoading } = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: () => fetch("/api/cart").then((r) => r.json()),
    staleTime: 0,
  });

  const cart = data?.data;
  const items: CartLine[] = cart?.items ?? [];

  // Update quantity mutation
  const updateQty = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const res = await fetch(`/api/cart/items/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      return res.json();
    },
    onMutate: async ({ productId, quantity }) => {
      await qc.cancelQueries({ queryKey: ["cart"] });
      const prev = qc.getQueryData<CartResponse>(["cart"]);
      qc.setQueryData<CartResponse>(["cart"], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: {
            ...old.data,
            items: old.data.items.map((it) =>
              it.productId === productId
                ? { ...it, quantity, lineTotalKes: it.priceKes * quantity }
                : it
            ),
            subtotalKes: old.data.items.reduce((sum, it) => {
              const q = it.productId === productId ? quantity : it.quantity;
              return sum + it.priceKes * q;
            }, 0),
            itemCount: old.data.items.reduce((sum, it) => {
              return sum + (it.productId === productId ? quantity : it.quantity);
            }, 0),
          },
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["cart"], ctx.prev);
      toast.error("Could not update quantity");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cart"] }),
  });

  // Delete item mutation
  const deleteItem = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch(`/api/cart/items/${productId}`, { method: "DELETE" });
      return res.json();
    },
    onMutate: async (productId) => {
      await qc.cancelQueries({ queryKey: ["cart"] });
      const prev = qc.getQueryData<CartResponse>(["cart"]);
      qc.setQueryData<CartResponse>(["cart"], (old) => {
        if (!old) return old;
        const filtered = old.data.items.filter((it) => it.productId !== productId);
        return {
          ...old,
          data: {
            ...old.data,
            items: filtered,
            subtotalKes: filtered.reduce((s, it) => s + it.lineTotalKes, 0),
            itemCount: filtered.reduce((s, it) => s + it.quantity, 0),
          },
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["cart"], ctx.prev);
      toast.error("Could not remove item");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cart"] }),
  });

  function handleApplyPromo() {
    if (promoCode.trim().toUpperCase() === "FECHI10") {
      setAppliedPromo("FECHI10");
      setPromoDiscount(Math.round((cart?.subtotalKes ?? 0) * 0.1));
      toast.success("Promo code applied! 10% off your order.");
    } else if (promoCode.trim().toUpperCase() === "NEWUSER") {
      setAppliedPromo("NEWUSER");
      setPromoDiscount(50000); // 500 KES
      toast.success("Promo code applied! KES 500 off your order.");
    } else {
      toast.error("Invalid promo code");
    }
  }

  const subtotalKes = cart?.subtotalKes ?? 0;
  const totalKes = subtotalKes + DELIVERY_KES - promoDiscount;

  // Order success panel
  if (placedOrderId) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-[24px] shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-10 max-w-[480px] w-full text-center"
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: "#dcfce7" }}
          >
            <Icon icon="mdi:check-circle" width={44} style={{ color: "#16a34a" }} />
          </div>
          <h2 className="font-heading font-bold text-[#1a1c1c] text-[28px] md:text-[32px] mb-3">
            Your order has been placed!
          </h2>
          <p className="font-body text-[#40493c] text-[15px] leading-[1.7] mb-2">
            Thank you for shopping with Fechi Organics.
          </p>
          <p className="font-body text-[#707a6b] text-[13px] mb-8">
            Order ID:{" "}
            <span className="font-mono font-semibold text-[#1a1c1c]">
              {placedOrderId.slice(0, 8).toUpperCase()}
            </span>
          </p>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 bg-[#27731e] text-white rounded-full px-8 py-4 font-body font-semibold text-[15px] hover:bg-[#045a03] transition-colors"
          >
            Continue Shopping
            <Icon icon="mdi:arrow-right" width={18} />
          </Link>
        </motion.div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Spinner size={40} />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 md:px-16 py-10 max-w-[1280px] mx-auto w-full">
      {/* Heading */}
      <h1 className="font-heading font-bold text-[#1a1c1c] text-[36px] md:text-[48px] text-center mb-8">
        Checkout
      </h1>

      {/* Step indicator */}
      <div className="mb-10">
        <StepIndicator />
      </div>

      {items.length === 0 ? (
        /* Empty cart state */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <Icon icon="mdi:cart-outline" width={80} className="text-[#c0cab8] mb-6" />
          <h2 className="font-heading text-[#1a1c1c] text-[28px] mb-3">Your cart is empty</h2>
          <p className="font-body text-[#40493c] text-[16px] mb-8">
            Add some natural goodness to your cart and come back!
          </p>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 bg-[#27731e] text-white rounded-full px-8 py-4 font-body text-[16px] hover:bg-[#045a03] transition-colors"
          >
            Continue Shopping
            <Icon icon="mdi:arrow-right" width={18} />
          </Link>
        </motion.div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left column — Review cart */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-[12px] shadow-[0_4px_10px_rgba(0,0,0,0.05)] p-6 md:p-8">
              <h2 className="font-heading font-semibold text-[#1a1c1c] text-[28px] md:text-[32px] mb-6">
                Review Your Cart
              </h2>

              <div className="flex flex-col gap-6">
                <AnimatePresence>
                  {items.map((item) => (
                    <motion.div
                      key={item.productId}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}
                      className="border-b border-[#e2e2e2] pb-6 last:border-b-0 flex gap-4 items-center"
                    >
                      {/* Product image */}
                      <div className="bg-[#f3f3f3] rounded-[8px] w-20 h-20 md:w-24 md:h-24 flex-shrink-0 overflow-hidden relative">
                        <Image
                          src={item.primaryImageUrl}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      </div>

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-heading font-semibold text-[#1a1c1c] text-[18px] md:text-[22px] leading-tight truncate">
                          {item.name}
                        </h3>
                        {item.variantLabel && (
                          <p className="font-body text-[#40493c] text-[13px] mt-0.5">
                            {item.variantLabel}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                          {/* Quantity stepper */}
                          <div className="flex items-center border border-[#c0cab8] rounded-[6px] overflow-hidden h-[40px] w-[112px]">
                            <button
                              onClick={() =>
                                item.quantity > 1
                                  ? updateQty.mutate({ productId: item.productId, quantity: item.quantity - 1 })
                                  : deleteItem.mutate(item.productId)
                              }
                              className="w-10 h-full flex items-center justify-center text-[#40493c] text-[18px] hover:bg-[#f0f0f0] transition-colors font-body"
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="flex-1 text-center font-body text-[14px] text-[#1a1c1c]">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQty.mutate({ productId: item.productId, quantity: item.quantity + 1 })
                              }
                              className="w-10 h-full flex items-center justify-center text-[#40493c] text-[18px] hover:bg-[#f0f0f0] transition-colors font-body"
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>

                          {/* Line total */}
                          <span className="font-body font-bold text-[#1a1c1c] text-[18px] md:text-[20px]">
                            {format(item.lineTotalKes)}
                          </span>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => deleteItem.mutate(item.productId)}
                        className="flex-shrink-0 p-2 text-[#a1a1a1] hover:text-red-500 transition-colors"
                        aria-label="Remove item"
                      >
                        <Icon icon="mdi:delete-outline" width={22} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Place Order button */}
              <div className="flex justify-end mt-8">
                <button
                  onClick={() => orderMutation.mutate()}
                  disabled={orderMutation.isPending}
                  className="inline-flex items-center gap-2 bg-[#045a03] text-white rounded-full px-8 py-4 font-body font-bold text-[15px] hover:bg-[#27731e] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {orderMutation.isPending ? (
                    <Spinner size={18} />
                  ) : (
                    <Icon icon="mdi:cart-check" width={18} />
                  )}
                  Place Order
                </button>
              </div>
            </div>
          </div>

          {/* Right column — Order summary */}
          <div className="w-full lg:w-[376px] flex-shrink-0">
            <div className="bg-white rounded-[12px] shadow-[0_4px_10px_rgba(0,0,0,0.05)] p-6 sticky top-[80px]">
              <h2 className="font-heading font-semibold text-[#1a1c1c] text-[22px] border-b border-[#e2e2e2] pb-4 mb-6">
                Order Summary
              </h2>

              <div className="flex flex-col gap-4">
                <SummaryRow
                  label={`Subtotal (${cart?.itemCount ?? 0} ${(cart?.itemCount ?? 0) === 1 ? "item" : "items"})`}
                  value={format(subtotalKes)}
                />
                <SummaryRow label="Delivery" value={format(DELIVERY_KES)} />
                {appliedPromo && (
                  <SummaryRow
                    label="Discount"
                    badge={appliedPromo}
                    value={`- ${format(promoDiscount)}`}
                    green
                  />
                )}
              </div>

              <div className="border-t border-[#e2e2e2] mt-4 pt-4">
                <div className="flex items-end justify-between">
                  <span className="font-body font-bold text-[#1a1c1c] text-[18px]">Total</span>
                  <div className="text-right">
                    <p className="font-body text-[#40493c] text-[12px]">Including VAT</p>
                    <p className="font-body font-bold text-[#045a03] text-[22px] md:text-[26px]">
                      {format(totalKes)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Promo code */}
              <div className="border-t border-[#e2e2e2] mt-4 pt-4">
                <p className="font-body font-medium text-[#40493c] text-[12px] tracking-[0.6px] mb-2">
                  Have a promo code?
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                    placeholder="ENTER CODE"
                    className="flex-1 min-w-0 border border-[#c0cab8] rounded-[6px] px-3 py-2.5 font-body text-[13px] text-[#1a1c1c] placeholder-[#6b7280] uppercase outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] bg-white"
                  />
                  <button
                    onClick={handleApplyPromo}
                    className="bg-[#e2e2e2] hover:bg-[#27731e] hover:text-white text-[#1a1c1c] rounded-[6px] px-4 py-2.5 font-body font-medium text-[13px] transition-colors flex-shrink-0"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* SSL note */}
              <div className="flex items-center justify-center gap-2 mt-5 text-[#707a6b]">
                <Icon icon="mdi:lock-outline" width={14} />
                <span className="font-body text-[13px]">Secure SSL Encrypted Checkout</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  badge,
  green,
}: {
  label: string;
  value: string;
  badge?: string;
  green?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`font-body text-[15px] ${green ? "text-[#005a01]" : "text-[#40493c]"}`}>
          {label}
        </span>
        {badge && (
          <span className="bg-[rgba(28,116,21,0.2)] text-[#005a01] font-body text-[11px] px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <span className={`font-body font-medium text-[15px] ${green ? "text-[#005a01]" : "text-[#1a1c1c]"}`}>
        {value}
      </span>
    </div>
  );
}
