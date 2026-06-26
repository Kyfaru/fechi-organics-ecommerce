"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@iconify/react";
import { Spinner } from "@/components/ui/spinner";
import { useCurrency } from "@/app/providers";
import type { CartLine } from "@/lib/cart";
import { posthog } from "@/lib/posthog";
import { StepIndicator } from "@/components/checkout/StepIndicator";

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

export function CartClient() {
  const router = useRouter();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [freeShipping, setFreeShipping] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);

  const { data, isLoading } = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: () => fetch("/api/cart").then((r) => r.json()),
    staleTime: 0,
  });

  const cart = data?.data;
  const items: CartLine[] = cart?.items ?? [];

  useEffect(() => {
    if (!cart) return;
    posthog.capture("cart_viewed", {
      item_count: cart.itemCount,
      subtotal_kes: cart.subtotalKes,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!cart]);

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
      const oldQty = prev?.data?.items.find((it) => it.productId === productId)?.quantity ?? null;
      posthog.capture("cart_item_quantity_changed", {
        product_id: productId,
        old_quantity: oldQty,
        new_quantity: quantity,
      });
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
      const removedItem = prev?.data?.items.find((it) => it.productId === productId);
      posthog.capture("cart_item_removed", {
        product_id: productId,
        product_name: removedItem?.name ?? null,
      });
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

  const subtotalKes = cart?.subtotalKes ?? 0;

  async function handleApplyPromo() {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;

    // Client-side reuse guard
    try {
      const used: string[] = JSON.parse(localStorage.getItem("fechi_used_coupons") ?? "[]");
      if (used.includes(code)) {
        toast.error("You've already used this coupon");
        return;
      }
    } catch { /* ignore */ }

    setPromoLoading(true);
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotalKes }),
      });
      const json = await res.json();
      const data = json?.data;
      if (!res.ok || !json.ok || !data?.valid) {
        toast.error(json?.error?.message ?? data?.message ?? "Invalid promo code");
        setAppliedPromo(null);
        setPromoDiscount(0);
        setFreeShipping(false);
      } else {
        setAppliedPromo(code);
        setPromoDiscount(data.discountKes);
        setFreeShipping(!!data.freeShipping);
        posthog.capture("promo_code_applied", { code, discount_kes: data.discountKes });
        toast.success(data.message ?? "Coupon applied!");
      }
    } catch {
      toast.error("Failed to validate coupon");
    } finally {
      setPromoLoading(false);
    }
  }

  const deliveryKes = freeShipping ? 0 : DELIVERY_KES;
  const totalKes = subtotalKes + deliveryKes - promoDiscount;

  function handleStartDelivery() {
    if (!items.length) return;
    if (appliedPromo) {
      sessionStorage.setItem("fechi_promo", appliedPromo);
    } else {
      sessionStorage.removeItem("fechi_promo");
    }

    posthog.capture("checkout_started", {
      step: "cart",
      next_step: "delivery",
      item_count: cart?.itemCount ?? 0,
      subtotal_kes: subtotalKes,
      has_promo: !!appliedPromo,
      promo_code: appliedPromo,
    });
    router.push("/delivery");
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
      <h1 className="font-heading font-bold text-[#1a1c1c] dark:text-white text-[36px] md:text-[48px] text-center mb-8">
        Checkout
      </h1>

      {/* Step indicator — step=1 for cart page */}
      <div className="mb-10">
        <StepIndicator step={1} />
      </div>

      {items.length === 0 ? (
        /* Empty cart state */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <Icon icon="mdi:cart-outline" width={80} className="text-[#c0cab8] mb-6" />
          <h2 className="font-heading text-[#1a1c1c] dark:text-white text-[28px] mb-3">Your cart is empty</h2>
          <p className="font-body text-[#40493c] dark:text-gray-300 text-[16px] mb-8">
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
            <div className="bg-white dark:bg-gray-900 rounded-[12px] shadow-[0_4px_10px_rgba(0,0,0,0.05)] p-6 md:p-8">
              <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[28px] md:text-[32px] mb-6">
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
                      className="border-b border-[#e2e2e2] dark:border-gray-700 pb-6 last:border-b-0 flex gap-4 items-center"
                    >
                      {/* Product image */}
                      <div className="bg-[#f3f3f3] dark:bg-gray-800 rounded-[8px] w-20 h-20 md:w-24 md:h-24 flex-shrink-0 overflow-hidden relative">
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
                        <h3 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[18px] md:text-[22px] leading-tight truncate">
                          {item.name}
                        </h3>
                        {item.variantLabel && (
                          <p className="font-body text-[#40493c] dark:text-gray-300 text-[13px] mt-0.5">
                            {item.variantLabel}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                          {/* Quantity stepper */}
                          <div className="flex items-center border border-[#c0cab8] dark:border-gray-600 rounded-[6px] overflow-hidden h-[40px] w-[112px]">
                            <button
                              onClick={() =>
                                item.quantity > 1
                                  ? updateQty.mutate({ productId: item.productId, quantity: item.quantity - 1 })
                                  : deleteItem.mutate(item.productId)
                              }
                              className="w-10 h-full flex items-center justify-center text-[#40493c] dark:text-gray-300 text-[18px] hover:bg-[#f0f0f0] dark:hover:bg-gray-700 transition-colors font-body"
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="flex-1 text-center font-body text-[14px] text-[#1a1c1c] dark:text-white">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQty.mutate({ productId: item.productId, quantity: item.quantity + 1 })
                              }
                              className="w-10 h-full flex items-center justify-center text-[#40493c] dark:text-gray-300 text-[18px] hover:bg-[#f0f0f0] dark:hover:bg-gray-700 transition-colors font-body"
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>

                          {/* Line total */}
                          <span className="font-body font-bold text-[#1a1c1c] dark:text-white text-[18px] md:text-[20px]">
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
                  onClick={handleStartDelivery}
                  className="inline-flex items-center gap-2 bg-[#045a03] text-white rounded-full px-8 py-4 font-body font-bold text-[15px] hover:bg-[#27731e] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <Icon icon="mdi:truck-delivery-outline" width={18} />
                  Place Order
                </button>
              </div>
            </div>
          </div>

          {/* Right column — Order summary */}
          <div className="w-full lg:w-[376px] flex-shrink-0">
            <div className="bg-white dark:bg-gray-900 rounded-[12px] shadow-[0_4px_10px_rgba(0,0,0,0.05)] p-6 sticky top-[80px]">
              <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[22px] border-b border-[#e2e2e2] dark:border-gray-700 pb-4 mb-6">
                Order Summary
              </h2>

              <div className="flex flex-col gap-4">
                <SummaryRow
                  label={`Subtotal (${cart?.itemCount ?? 0} ${(cart?.itemCount ?? 0) === 1 ? "item" : "items"})`}
                  value={format(subtotalKes)}
                />
                <SummaryRow
                  label="Delivery"
                  value={freeShipping ? "FREE" : format(DELIVERY_KES)}
                  green={freeShipping}
                />
                {appliedPromo && (
                  <SummaryRow
                    label="Discount"
                    badge={appliedPromo}
                    value={`- ${format(promoDiscount)}`}
                    green
                  />
                )}
              </div>

              <div className="border-t border-[#e2e2e2] dark:border-gray-700 mt-4 pt-4">
                <div className="flex items-end justify-between">
                  <span className="font-body font-bold text-[#1a1c1c] dark:text-white text-[18px]">Total</span>
                  <div className="text-right">
                    <p className="font-body text-[#40493c] dark:text-gray-400 text-[12px]">Including VAT</p>
                    <p className="font-body font-bold text-[#045a03] text-[22px] md:text-[26px]">
                      {format(totalKes)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Promo code */}
              <div className="border-t border-[#e2e2e2] dark:border-gray-700 mt-4 pt-4">
                <p className="font-body font-medium text-[#40493c] dark:text-gray-300 text-[12px] tracking-[0.6px] mb-2">
                  Have a promo code?
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                    placeholder="ENTER CODE"
                    disabled={promoLoading}
                    className="flex-1 min-w-0 border border-[#c0cab8] dark:border-gray-600 rounded-[6px] px-3 py-2.5 font-body text-[13px] text-[#1a1c1c] dark:text-white placeholder-[#6b7280] uppercase outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] bg-white dark:bg-gray-800 disabled:opacity-60"
                  />
                  <button
                    onClick={handleApplyPromo}
                    disabled={promoLoading}
                    className="bg-[#e2e2e2] dark:bg-gray-700 hover:bg-[#27731e] hover:text-white text-[#1a1c1c] dark:text-gray-200 rounded-[6px] px-4 py-2.5 font-body font-medium text-[13px] transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {promoLoading ? "..." : "Apply"}
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
        <span className={`font-body text-[15px] ${green ? "text-[#005a01]" : "text-[#40493c] dark:text-gray-400"}`}>
          {label}
        </span>
        {badge && (
          <span className="bg-[rgba(28,116,21,0.2)] text-[#005a01] font-body text-[11px] px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <span className={`font-body font-medium text-[15px] ${green ? "text-[#005a01]" : "text-[#1a1c1c] dark:text-gray-200"}`}>
        {value}
      </span>
    </div>
  );
}
