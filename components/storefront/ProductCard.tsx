"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrency } from "@/app/providers";
import { Tooltip } from "@/components/ui/Tooltip";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import type { ProductCard as ProductCardType } from "@/lib/queries/products";

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
      className="relative bg-white rounded-[20px] shadow-[0px_4px_15.3px_0px_rgba(0,0,0,0.10)] w-full max-w-[310px] overflow-hidden group"
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
      <Tooltip label={isFavorited ? "Remove favourite" : "Add to favourites"} position="bottom">
        <div className="absolute top-3 flex left-3 z-10 ">
        <button
          onClick={() => favMutation.mutate()}
          className="relative top-3 left-3 z-10 w-[46px] h-[46px] bg-white rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          aria-label={isFavorited ? "Remove from favourites" : "Add to favourites"}
        >
          <Icon
            icon={isFavorited ? "mdi:heart" : "hugeicons:favourite"}
            width={22}
            className={isFavorited ? "text-[#c00]" : "text-[#c4c4c4]"}
          />
        </button>
       </div>
      </Tooltip>

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
          <h3 className="text-[18px] font-body text-black leading-snug mb-1 hover:text-[#27731e] transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Short description */}
        {product.shortDescription && (
          <p className="text-[#a1a1a1] text-[13px] font-body mb-3 line-clamp-1 pr-6">
            {product.shortDescription}
          </p>
        )}

        {/* Price row + Add to Cart */}
        <div className="flex items-center justify-between mt-2">
          {/* Price */}
          <div className="flex flex-col">
            <span className="text-[20px] font-body text-black leading-tight">
              {format(product.priceKes)}
            </span>
            {hasDiscount && (
              <span className="text-[12px] text-[#c4c4c4] line-through font-body">
                {format(product.compareAtPriceKes!)}
              </span>
            )}
          </div>

          {/* Add to Cart */}
          <Tooltip label="Add to cart">
            <AnimatePresence mode="wait">
              <motion.button
                key={justAdded ? "added" : "add"}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => cartMutation.mutate()}
                disabled={cartMutation.isPending || product.stock === 0}
                className={[
                  "flex items-center gap-1 border rounded-[40px] px-3 py-2 text-[13px] font-body transition-all",
                  justAdded
                    ? "bg-[#27731e] text-white border-[#27731e]"
                    : "border-black text-black hover:bg-[#27731e] hover:text-white hover:border-[#27731e]",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                ].join(" ")}
                aria-label="Add to cart"
              >
                {justAdded ? (
                  <>
                    <Icon icon="mdi:check" width={14} />
                    Added
                  </>
                ) : (
                  <>
                    {cartMutation.isPending ? (
                      <Spinner size={14} invert />
                    ) : (
                      <Icon icon="mdi:cart-plus" width={14} />
                    )}
                    Add to Cart
                  </>
                )}
              </motion.button>
            </AnimatePresence>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  );
}
