"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { posthog } from "@/lib/posthog";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountLayout } from "@/components/account/AccountLayout";
import { toast } from "@/lib/toast";
import type { ProductCard as ProductCardType } from "@/lib/queries/products";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------

function WishlistSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-[16px] border border-[#e2e2e2] dark:border-gray-700 p-4 flex items-center gap-4 animate-pulse">
      <div className="w-20 h-20 rounded-[8px] bg-gray-200 dark:bg-gray-700 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
      </div>
      <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded-full shrink-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wishlist item card (horizontal)
// ---------------------------------------------------------------------------

function WishlistItemCard({ product }: { product: ProductCardType }) {
  const queryClient = useQueryClient();

  // Add to cart mutation — POST /api/cart/items
  const addToCartMutation = useMutation({
    mutationFn: () =>
      fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data?.ok) {
        toast.success("Added to cart.");
        // Invalidate cart query so the cart badge updates
        queryClient.invalidateQueries({ queryKey: ["cart"] });
      } else {
        toast.error(data?.error?.message ?? "Could not add to cart.");
      }
    },
    onError: () => {
      console.error("[wishlist] addToCart error for product", product.id);
      toast.error("Network error — please try again.");
    },
  });

  // Remove from wishlist mutation — POST /api/favorites (toggle)
  const removeMutation = useMutation({
    mutationFn: () =>
      fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data?.ok) {
        // Refetch wishlist so the item disappears
        queryClient.invalidateQueries({ queryKey: ["favorites", "full"] });
        toast.success("Removed from wishlist.");
      } else {
        toast.error("Could not remove item.");
      }
    },
    onError: () => {
      console.error("[wishlist] removeFavorite error for product", product.id);
      toast.error("Network error — please try again.");
    },
  });

  const isOutOfStock = product.stock === 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="bg-white dark:bg-gray-900 rounded-[16px] border border-[#e2e2e2] dark:border-gray-700 p-4 flex items-center gap-4"
    >
      {/* Product image */}
      <div className="relative w-20 h-20 rounded-[8px] overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0">
        <Image
          src={product.primaryImageUrl}
          alt={product.name}
          fill
          sizes="80px"
          className="object-cover"
        />
      </div>

      {/* Product info */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/shop/${product.categorySlug}/${product.slug}`}
          className="font-semibold text-[16px] text-[#1a1c1c] dark:text-white hover:text-[#27731e] dark:hover:text-[#a4f690] transition-colors line-clamp-2"
        >
          {product.name}
        </Link>
        <p className="text-[#27731e] font-bold text-[15px] mt-1">
          {formatKes(product.priceKes)}
        </p>
        {isOutOfStock ? (
          <p className="text-red-500 text-[12px] font-medium mt-0.5">
            Out of stock
          </p>
        ) : (
          <p className="text-[#40493c] dark:text-gray-400 text-[12px] mt-0.5">
            In stock
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => addToCartMutation.mutate()}
          disabled={isOutOfStock || addToCartMutation.isPending}
          className="inline-flex items-center gap-1.5 bg-[#27731e] hover:bg-[#045a03] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-4 py-2 rounded-full transition-colors duration-150"
          aria-label={`Add ${product.name} to cart`}
        >
          {addToCartMutation.isPending ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icon icon="mdi:cart-plus" width={15} />
          )}
          <span className="hidden sm:inline">Add to Cart</span>
        </button>

        <button
          type="button"
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-[#e2e2e2] dark:border-gray-700 text-[#40493c] dark:text-gray-400 hover:border-red-300 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 transition-colors duration-150"
          aria-label={`Remove ${product.name} from wishlist`}
        >
          {removeMutation.isPending ? (
            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icon icon="mdi:delete-outline" width={18} />
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * WishlistClient
 *
 * Restyled to horizontal cards within AccountLayout.
 * Fetches favorites via GET /api/favorites?full=1.
 */
export function WishlistClient() {
  const { data, isLoading } = useQuery<{
    ok: boolean;
    data: { products: ProductCardType[] };
  }>({
    queryKey: ["favorites", "full"],
    queryFn: () => fetch("/api/favorites?full=1").then((r) => r.json()),
    staleTime: 0,
  });

  const products = data?.data?.products ?? [];

  useEffect(() => {
    if (isLoading) return;
    posthog.capture("wishlist_viewed", { item_count: products.length });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <AccountLayout>
      <div className="px-4 md:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-heading font-bold text-[28px] text-[#1a1c1c] dark:text-white">
            My Wishlist
            {products.length > 0 && !isLoading ? (
              <span className="text-[#40493c] dark:text-gray-400 font-normal text-[22px] ml-2">
                ({products.length})
              </span>
            ) : null}
          </h1>
          <p className="text-[#40493c] dark:text-gray-400 text-[15px] mt-1">
            Your saved items from Fechi Organics.
          </p>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <WishlistSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && products.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="text-center py-20 flex flex-col items-center gap-5"
          >
            <div className="w-24 h-24 bg-[#f0fdf4] dark:bg-green-900/20 rounded-full flex items-center justify-center">
              <Icon
                icon="mdi:heart-outline"
                width={48}
                className="text-[#27731e]"
              />
            </div>
            <h2 className="font-heading text-[#1a1c1c] dark:text-white text-[24px] font-semibold">
              No saved items yet
            </h2>
            <p className="text-[#40493c] dark:text-gray-400 text-[15px] max-w-[300px]">
              Browse our shop and tap the heart on products you love.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-[#27731e] hover:bg-[#045a03] text-white rounded-full px-8 py-3.5 font-semibold text-[14px] transition-colors duration-150 mt-1"
            >
              Browse Products
              <Icon icon="mdi:arrow-right" width={16} />
            </Link>
          </motion.div>
        )}

        {/* Product list — horizontal cards */}
        {!isLoading && products.length > 0 && (
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {products.map((product) => (
                <WishlistItemCard key={product.id} product={product} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </AccountLayout>
  );
}
