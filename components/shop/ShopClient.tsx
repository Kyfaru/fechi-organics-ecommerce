"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { ProductCard } from "@/components/storefront/ProductCard";
import { SkeletonShopGrid } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { CategoryItem } from "@/lib/queries/categories";
import type { ProductCard as ProductCardType } from "@/lib/queries/products";
import { useSearchParams, useRouter } from "next/navigation";
import { posthog } from "@/lib/posthog";

type Sort = "newest" | "best" | "price_asc" | "price_desc";
type ProductsPage = { items: ProductCardType[]; nextCursor: string | null; total?: number };

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "best", label: "Best Selling" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

type Props = {
  categories: CategoryItem[];
};

export function ShopClient({ categories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<string>(
    searchParams.get("category") ?? "all"
  );
  const [sort, setSort] = useState<Sort>("best");
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Sync URL param on mount
  useEffect(() => {
    const cat = searchParams.get("category");
    if (cat) setActiveCategory(cat);
  }, [searchParams]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<ProductsPage>({
    queryKey: ["shop-products", activeCategory, sort],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (activeCategory !== "all") params.set("category", activeCategory);
      params.set("sort", sort);
      params.set("limit", "12");
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await fetch(`/api/storefront/products?${params.toString()}`);
      const json = await res.json();
      return { items: json.data?.items ?? [], nextCursor: json.data?.nextCursor ?? null };
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const allProducts = data?.pages.flatMap((p) => p.items) ?? [];
  const totalShowing = allProducts.length;

  useEffect(() => {
    if (isLoading || allProducts.length === 0) return;
    posthog.capture("product_list_viewed", {
      category: activeCategory,
      sort,
      result_count: totalShowing,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  function handleCategoryChange(slug: string) {
    setActiveCategory(slug);
    posthog.capture("product_filter_applied", { category: slug });
    const params = new URLSearchParams(searchParams);
    if (slug === "all") {
      params.delete("category");
    } else {
      params.set("category", slug);
    }
    router.replace(`/shop?${params.toString()}`, { scroll: false });
  }

  return (
    <>
      {/* Hero band */}
      <section className="relative bg-[#27731e] rounded-[25px] mx-4 md:mx-8 mt-4 overflow-hidden min-h-[220px] md:min-h-[260px] flex items-end">
        {/* Background "Signature" text */}
        <div
          className="absolute inset-0 flex items-center overflow-hidden pointer-events-none select-none"
          aria-hidden
        >
          <span
            className="text-[#4aad3d] font-heading font-semibold whitespace-nowrap leading-none opacity-60"
            style={{ fontSize: "clamp(100px, 18vw, 240px)", letterSpacing: "0.04em" }}
          >
            Products
          </span>
        </div>

        <div className="relative z-10 px-8 md:px-12 py-10 flex flex-col md:flex-row items-end justify-between w-full gap-6">
          <div>
            <p className="font-body text-[#a4f690] text-[12px] md:text-[13px] tracking-[1.2px] uppercase mb-2">
              Fechi Organics Store
            </p>
            <h1 className="font-heading font-semibold text-white text-[36px] md:text-[52px] tracking-[-1px] leading-[1.05] mb-3">
              Shop All Products
            </h1>
            <p className="font-body text-white/80 text-[15px] max-w-[380px]">
              Natural skincare for every skin type. Ethically sourced, scientifically proven, organically African.
            </p>
          </div>

          {/* Decorative product image */}
          <div className="hidden md:block relative w-[200px] h-[180px] flex-shrink-0">
            <Image
              src="http://localhost:3845/assets/c0c890c2732723fc0f2a0a3cf9e0916e2e6ef0a2.png"
              alt="Fechi Organics products"
              fill
              className="object-contain drop-shadow-2xl"
              sizes="200px"
            />
          </div>
        </div>
      </section>

      {/* Filters + Sort bar */}
      <section className="px-4 md:px-8 pt-8 pb-4">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Category filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip
              label="All"
              active={activeCategory === "all"}
              onClick={() => handleCategoryChange("all")}
            />
            {categories.map((cat) => (
              <FilterChip
                key={cat.slug}
                label={cat.name}
                active={activeCategory === cat.slug}
                onClick={() => handleCategoryChange(cat.slug)}
              />
            ))}
          </div>

          {/* Sort dropdown */}
          <div className="relative flex items-center gap-2 flex-shrink-0">
            <span className="font-body text-[#40493c] text-[14px]">Sort by:</span>
            <select
              value={sort}
              title="Sort products"
              onChange={(e) => {
                const v = e.target.value as Sort;
                setSort(v);
                posthog.capture("product_sort_changed", { sort: v });
              }}
              className="font-body text-[14px] text-[#1a1c1c] border border-[#c0cab8] rounded-full px-4 py-2 bg-white outline-none focus:border-[#27731e] cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Product grid */}
      <section className="px-4 md:px-8 py-8">
        <div className="max-w-[1440px] mx-auto">
          {isLoading ? (
            <SkeletonShopGrid count={8} />
          ) : (
            <>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeCategory}-${sort}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center"
                >
                  {allProducts.map((product, idx) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: (idx % 12) * 0.05 }}
                      className="w-full max-w-[310px]"
                    >
                      <ProductCard product={product} />
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>

              {allProducts.length === 0 && (
                <div className="text-center py-20">
                  <Icon icon="mdi:package-variant-remove" width={64} className="text-[#c0cab8] mx-auto mb-4" />
                  <p className="font-body text-[#40493c] text-[18px]">No products found in this category.</p>
                  <button
                    onClick={() => handleCategoryChange("all")}
                    className="mt-4 inline-flex items-center gap-2 bg-[#27731e] text-white rounded-full px-6 py-3 font-body text-[14px] hover:bg-[#045a03] transition-colors"
                  >
                    View All Products
                  </button>
                </div>
              )}
            </>
          )}

          {/* Product count */}
          {totalShowing > 0 && (
            <div className="text-center mt-8 mb-6">
              <p className="font-body text-[#40493c] text-[14px]">
                Showing {totalShowing} products
              </p>
            </div>
          )}

          {/* Load More */}
          {hasNextPage && (
            <div ref={loadMoreRef} className="flex justify-center mt-4">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="inline-flex items-center gap-2 border border-[#27731e] text-[#27731e] rounded-full px-8 py-3.5 font-body text-[14px] hover:bg-[#27731e] hover:text-white transition-all disabled:opacity-50"
              >
                {isFetchingNextPage ? (
                  <>
                    <Spinner size={16} invert />
                    Loading...
                  </>
                ) : (
                  "Load More Products"
                )}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Promo banner */}
      <section className="px-4 md:px-8 pb-16">
        <div className="max-w-[1440px] mx-auto">
          <div className="bg-[#fec700] rounded-[24px] flex items-center justify-between px-8 py-6 gap-4">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 bg-white/30 rounded-full flex items-center justify-center flex-shrink-0">
                <Icon icon="mdi:tag-outline" width={28} className="text-[#1a1c1c]" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-[#1a1c1c] text-[22px] md:text-[28px] tracking-[-0.5px]">
                  Get Up to 50% OFF
                </h3>
                <p className="font-body text-[#1a1c1c]/70 text-[14px] mt-1">
                  On selected natural skincare essentials this week.
                </p>
              </div>
            </div>
            <Link
              href="/shop?sort=best"
              className="flex-shrink-0 inline-flex items-center gap-2 bg-[#1a1c1c] text-white rounded-full px-6 py-3.5 font-body text-[14px] hover:bg-[#27731e] transition-colors"
            >
              Shop Sale
              <Icon icon="mdi:arrow-right" width={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-4 py-2 font-body text-[13px] md:text-[14px] transition-all",
        active
          ? "bg-[#27731e] text-white"
          : "bg-white border border-[#c0cab8] text-[#40493c] hover:border-[#27731e] hover:text-[#27731e]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
