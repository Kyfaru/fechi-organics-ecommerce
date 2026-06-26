"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef } from "react";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrency } from "@/app/providers";
import { Tooltip } from "@/components/ui/Tooltip";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import type { ProductCard as ProductCardType } from "@/lib/queries/products";

type CartData = {
  ok: boolean;
  data: { items: Array<{ productId: string; quantity: number }> };
};

type Props = {
  product: ProductCardType;
};

export function ProductCard({ product }: Props) {
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [justAdded, setJustAdded] = useState(false);

  // Favorites
  const { data: favsData } = useQuery<{ ok: boolean; data: { productIds: string[] } }>({
    queryKey: ["favorites"],
    queryFn: () => fetch("/api/favorites").then((r) => r.json()),
    staleTime: 0,
  });
  const isFavorited = favsData?.data?.productIds?.includes(product.id) ?? false;

  const favMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      if (res.status === 401) throw new Error("AUTH_REQUIRED");
      return res.json();
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["favorites"] });
      const prev = qc.getQueryData(["favorites"]);
      qc.setQueryData(["favorites"], (old: { ok: boolean; data: { productIds: string[] } } | undefined) => {
        if (!old) return old;
        const ids = old.data.productIds;
        return {
          ...old,
          data: {
            productIds: ids.includes(product.id)
              ? ids.filter((id) => id !== product.id)
              : [...ids, product.id],
          },
        };
      });
      return { prev };
    },
    onSuccess: (data) => {
      const added = data?.data?.favorited;
      if (added !== undefined) {
        toast.success(added ? "Added to wishlist" : "Removed from wishlist");
      }
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["favorites"], ctx.prev);
      if (_err.message === "AUTH_REQUIRED") {
        toast.error("Sign in to save favourites");
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["favorites"] });
      qc.invalidateQueries({ queryKey: ["favorites", "full"] });
    },
  });

  const cartMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      return res.json();
    },
    onSuccess: () => {
      toast.success("Added to cart!");
      qc.invalidateQueries({ queryKey: ["cart"] });
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1800);
    },
    onError: () => {
      toast.error("Could not add to cart");
    },
  });

  // Cart state — queryFn required even when reading shared cache
  const { data: cartData } = useQuery<CartData>({
    queryKey: ["cart"],
    queryFn: () => fetch("/api/cart").then((r) => r.json()),
    staleTime: 30_000,
  });
  const cartItem = cartData?.data?.items?.find((i) => i.productId === product.id);
  const inCart = !!cartItem;
  const cartQty = cartItem?.quantity ?? 0;

  const updateCartQtyMutation = useMutation({
    mutationFn: async (qty: number) => {
      if (qty <= 0) {
        return fetch(`/api/cart/items/${product.id}`, { method: "DELETE" }).then((r) => r.json());
      }
      return fetch(`/api/cart/items/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qty }),
      }).then((r) => r.json());
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cart"] }),
  });

  // Optimistic qty — instant UI, debounced API (600ms)
  const [pendingQty, setPendingQty] = useState<number | null>(null);
  const qtyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayQty = pendingQty !== null ? pendingQty : cartQty;
  const showInCart = displayQty > 0;

  function handleQtyChange(newQty: number) {
    const clamped = Math.max(0, newQty);
    setPendingQty(clamped);
    if (qtyTimerRef.current) clearTimeout(qtyTimerRef.current);
    qtyTimerRef.current = setTimeout(() => {
      updateCartQtyMutation.mutate(clamped, {
        onSettled: () => setPendingQty(null),
      });
    }, 600);
  }

  function handleAddToCart() {
    if (qtyTimerRef.current) clearTimeout(qtyTimerRef.current);
    setPendingQty(null);
    cartMutation.mutate();
  }

  const hasDiscount = !!product.compareAtPriceKes;
  const discountPct = hasDiscount
    ? Math.round((1 - product.priceKes / product.compareAtPriceKes!) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="relative bg-white dark:bg-gray-900 rounded-[20px] shadow-[0px_4px_15.3px_0px_rgba(0,0,0,0.10)] w-full max-w-[310px] overflow-hidden group"
    >
      {/* Offer badge */}
      {hasDiscount && (
        
        <span className="absolute top-6 left-0 z-10 bg-[#27731e] text-white text-[14px] font-medium px-2.5 py-1 pr-3 rounded-br-full rounded-tr-full">
          {discountPct}% OFF
        </span>
      )}
      {product.bestSeller && !hasDiscount && (
        <span className="absolute top-3 left-3 z-10 bg-[#fec700] text-[#1a1c1c] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
          Best Seller
        </span>
      )}

      {/* Favorite */}
      <div className="relative flex top-0 mt-5 left-63 z-10">
      <Tooltip label={isFavorited ? "Remove favourite" : "Add to favourites"} position="top">
    <button
      onClick={() => favMutation.mutate()}
      className="absolute w-[46px] h-[46px] bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
      title="favourite"
    >
          <Icon
            icon={isFavorited ? "mdi:heart" : "hugeicons:favourite"}
            width={22}
            className={isFavorited ? "text-[#c00]" : "text-[#c4c4c4]"}
          />
        </button>
       
      </Tooltip>
</div>

      {/* Product image */}
      <Link href={`/shop/${product.slug}`}>
        <div className="bg-[#f6f6f6] rounded-[20px] h-[280px] flex items-center justify-center overflow-hidden relative -top-6">
          <Image
            src={product.primaryImageUrl}
            alt={product.name}
            width={226}
            height={280}
            className="object-contain h-full w-full transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      </Link>

      {/* Card body */}
      <div className="px-5 pb-7 pt-1">
        {/* Category */}
        <p className="text-[#27731e] text-[14px] font-body mb-1">{product.categoryName}</p>

        {/* Name */}
        <Link href={`/shop/${product.slug}`}>
          <h3 className="text-[18px] font-body text-black dark:text-white leading-snug mb-1 hover:text-[#27731e] transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Short description */}
        {product.shortDescription && (
          <p className="text-[#a1a1a1] text-[13px] font-body mb-3 line-clamp-1 pr-6">
            {product.shortDescription}
          </p>
        )}

        {/* Price + CTA */}
        <div className="mt-2">
          <div className="flex items-center justify-between">
            {/* Price */}
            <div className="flex flex-col">
              <span className="text-[20px] font-body text-black dark:text-white leading-tight">
                {format(product.priceKes)}
              </span>
              {hasDiscount && (
                <span className="text-[12px] text-[#c4c4c4] line-through font-body">
                  {format(product.compareAtPriceKes!)}
                </span>
              )}
            </div>

            {/* CTA — Add to Cart OR Go to Cart */}
            {!showInCart ? (
              <Tooltip label="Add to cart">
                <AnimatePresence mode="wait">
                  <motion.button
                    key={justAdded ? "added" : "add"}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={handleAddToCart}
                    disabled={cartMutation.isPending || product.stock === 0}
                    className={[
                      "flex items-center gap-1 border rounded-[40px] px-3 py-2 text-[13px] font-body transition-all",
                      justAdded
                        ? "bg-[#27731e] text-white border-[#27731e]"
                        : "border-black dark:border-gray-600 text-black dark:text-gray-200 hover:bg-[#27731e] hover:text-white hover:border-[#27731e]",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                    ].join(" ")}
                    aria-label="Add to cart"
                  >
                    {justAdded ? (
                      <><Icon icon="mdi:check" width={14} />Added</>
                    ) : (
                      <>{cartMutation.isPending ? <Spinner size={14} invert /> : <Icon icon="mdi:cart-plus" width={14} />}Add to Cart</>
                    )}
                  </motion.button>
                </AnimatePresence>
              </Tooltip>
            ) : (
              <Link
                href="/cart"
                className="flex items-center gap-1.5 rounded-[40px] px-3 py-2 text-[13px] font-body font-semibold transition-all shadow-sm"
                style={{ background: "#fec700", color: "#1a1c1c" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#e5b600"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#fec700"; }}
              >
                <Icon icon="mdi:cart-check" width={14} />
                Go to Cart
              </Link>
            )}
          </div>

          {/* Quantity input — own row, only when in cart */}
          {showInCart && (
            <div className="flex justify-center mt-3">
              <div className="py-1.5 px-3 inline-flex bg-white dark:bg-gray-900 border border-[#c0cab8] dark:border-gray-600 rounded-[10px]">
                <div className="flex items-center gap-x-2">
                  <button
                    type="button"
                    onClick={() => handleQtyChange(displayQty - 1)}
                    className="size-6 inline-flex justify-center items-center rounded-md border border-[#c0cab8] dark:border-gray-600 text-[#1a1c1c] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none transition-colors"
                    aria-label="Decrease"
                  >
                    <svg className="shrink-0 size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"/>
                    </svg>
                  </button>
                  <input
                    className="p-0 w-7 bg-transparent border-0 text-[#1a1c1c] dark:text-neutral-200 text-center focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none font-body text-[14px] font-semibold"
                    style={{ MozAppearance: "textfield" } as React.CSSProperties}
                    type="number"
                    value={displayQty}
                    min={0}
                    max={99}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!isNaN(v) && v >= 0) handleQtyChange(v);
                    }}
                    aria-label="Cart quantity"
                  />
                  <button
                    type="button"
                    onClick={() => handleQtyChange(displayQty + 1)}
                    className="size-6 inline-flex justify-center items-center rounded-md border border-[#c0cab8] dark:border-gray-600 text-[#1a1c1c] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none transition-colors"
                    aria-label="Increase"
                  >
                    <svg className="shrink-0 size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"/>
                      <path d="M12 5v14"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
