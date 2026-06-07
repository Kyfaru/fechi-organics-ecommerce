"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQuery } from "@tanstack/react-query";
import { SkeletonShopGrid } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { ProductCard as ProductCardType } from "@/lib/queries/products";

export function WishlistClient() {
  // Fetch full product shapes for all favorited items.
  // staleTime:0 ensures we always re-check after a heart toggle elsewhere.
  const { data, isLoading } = useQuery<{
    ok: boolean;
    data: { products: ProductCardType[] };
  }>({
    queryKey: ["favorites", "full"],
    queryFn: () => fetch("/api/favorites?full=1").then((r) => r.json()),
    staleTime: 0,
  });

  const products = data?.data?.products ?? [];

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero / page header                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-[#f9f9f9] px-4 md:px-8 pt-12 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p className="font-body text-[#40493c] text-[12px] tracking-[1.5px] uppercase mb-2">
            Your Saved Items
          </p>
          <h1 className="font-heading font-semibold text-[#1a1c1c] text-[40px] md:text-[52px] tracking-[-1px]">
            My Wishlist
            {products.length > 0 && !isLoading ? ` (${products.length})` : ""}
          </h1>
        </motion.div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Content                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-4 md:px-8 py-12">
        {/* Loading state */}
        {isLoading && <SkeletonShopGrid count={4} />}

        {/* Empty state */}
        {!isLoading && products.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center py-24 flex flex-col items-center gap-5"
          >
            <div className="w-24 h-24 bg-[#f0fdf4] rounded-full flex items-center justify-center">
              <Icon icon="mdi:heart-outline" width={48} className="text-[#27731e]" />
            </div>
            <h2 className="font-heading text-[#1a1c1c] text-[28px]">
              No saved items yet
            </h2>
            <p className="font-body text-[#40493c] text-[16px] max-w-[320px]">
              Browse our shop and tap the heart on products you love.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-[#27731e] text-white rounded-full px-8 py-4 font-body text-[15px] hover:bg-[#045a03] transition-colors mt-2"
            >
              Browse Products
              <Icon icon="mdi:arrow-right" width={16} />
            </Link>
          </motion.div>
        )}

        {/* Product grid */}
        {!isLoading && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center">
            {products.map((product, idx) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.06 }}
                className="w-full max-w-[310px]"
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
