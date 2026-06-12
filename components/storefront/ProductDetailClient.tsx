"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrency } from "@/app/providers";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { ProductCard as ProductCardType, ProductDetail } from "@/lib/queries/products";
import { posthog } from "@/lib/posthog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Props = {
  product: ProductDetail;
};

type RelatedResponse = {
  ok: boolean;
  data: { items: ProductCardType[] };
};

type FavoritesResponse = {
  ok: boolean;
  data: { productIds: string[] };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round a rating to the nearest 0.5 (e.g. 3.7 → 3.5, 3.8 → 4.0) */
function roundHalf(n: number) {
  return Math.round(n * 2) / 2;
}

/** Compute whole stars, half star, and empty stars from a 0–5 rating. */
function getStarBreakdown(rating: number) {
  const rounded = roundHalf(Math.min(5, Math.max(0, rating)));
  const full = Math.floor(rounded);
  const half = rounded % 1 !== 0 ? 1 : 0;
  const empty = 5 - full - half;
  return { full, half, empty };
}

/** Returns a discount percentage string (e.g. "25") */
function discountPct(price: number, compareAt: number) {
  return Math.round((1 - price / compareAt) * 100).toString();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single star icon — full, half, or empty. */
function Star({ type }: { type: "full" | "half" | "empty" }) {
  const icon =
    type === "full"
      ? "mdi:star"
      : type === "half"
        ? "mdi:star-half-full"
        : "mdi:star-outline";
  const color = type === "empty" ? "#e2e2e2" : "#fec700";
  return <Icon icon={icon} width={18} style={{ color }} />;
}

/** Renders 5 stars from a numeric rating. */
function StarRow({ rating, count }: { rating: number; count: number }) {
  const { full, half, empty } = getStarBreakdown(rating);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: full }).map((_, i) => (
          <Star key={`f-${i}`} type="full" />
        ))}
        {half === 1 && <Star type="half" />}
        {Array.from({ length: empty }).map((_, i) => (
          <Star key={`e-${i}`} type="empty" />
        ))}
      </div>
      <span
        className="font-body text-[13px]"
        style={{ color: "#40493c" }}
      >
        ({count})
      </span>
    </div>
  );
}

/** Stock availability badge */
function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) {
    return (
      <span
        className="text-[12px] font-body font-semibold px-3 py-1 rounded-full"
        style={{ background: "#fee2e2", color: "#dc2626" }}
      >
        Out of Stock
      </span>
    );
  }
  if (stock <= 5) {
    return (
      <span
        className="text-[12px] font-body font-semibold px-3 py-1 rounded-full"
        style={{ background: "#fef9c3", color: "#ca8a04" }}
      >
        Low Stock ({stock} left)
      </span>
    );
  }
  return (
    <span
      className="text-[12px] font-body font-semibold px-3 py-1 rounded-full"
      style={{ background: "#e8fce3", color: "#27731e" }}
    >
      In Stock
    </span>
  );
}

/** Brand highlight pills shown below the wishlist button */
const HIGHLIGHTS = [
  { icon: "mdi:leaf", label: "100% Organic" },
  { icon: "mdi:paw", label: "Cruelty-Free" },
  { icon: "mdi:earth", label: "African Heritage" },
] as const;

function HighlightPills() {
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {HIGHLIGHTS.map((h) => (
        <span
          key={h.label}
          className="flex items-center gap-1.5 font-body text-[12px] font-medium px-3 py-1.5 rounded-full"
          style={{
            background: "#f0fdf0",
            color: "#27731e",
            border: "1px solid #c4e8be",
          }}
        >
          <Icon icon={h.icon} width={14} />
          {h.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ProductDetailClient({ product }: Props) {
  const qc = useQueryClient();
  const { format } = useCurrency();

  // ── Local state ────────────────────────────────────────────────────────────
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  // ── Derived values ─────────────────────────────────────────────────────────
  const hasDiscount = !!product.compareAtPriceKes;
  const pct = hasDiscount
    ? discountPct(product.priceKes, product.compareAtPriceKes!)
    : null;

  // Active image URL — fallback to primaryImageUrl when images array is empty
  const activeImageUrl =
    product.images[selectedImage]?.url ?? product.primaryImageUrl;
  const activeImageAlt =
    product.images[selectedImage]?.alt ?? product.name;

  // Quantity stepper bounds
  const maxQty = Math.min(10, product.stock);

  function decQty() {
    setQuantity((q) => Math.max(1, q - 1));
  }
  function incQty() {
    setQuantity((q) => Math.min(maxQty, q + 1));
  }

  // ── Favorites query + mutation ─────────────────────────────────────────────
  const { data: favsData } = useQuery<FavoritesResponse>({
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
      const prev = qc.getQueryData<FavoritesResponse>(["favorites"]);
      // Optimistic toggle
      qc.setQueryData<FavoritesResponse>(["favorites"], (old) => {
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
      const favorited = data?.data?.favorited;
      toast.success(favorited ? "Added to wishlist" : "Removed from wishlist");
      posthog.capture(favorited ? "product_favorited" : "product_unfavorited", {
        product_id: product.id,
        product_name: product.name,
        source: "detail_page",
      });
    },
    onError: (_e, _v, ctx) => {
      // Roll back optimistic update on error
      if (ctx?.prev) qc.setQueryData(["favorites"], ctx.prev);
      if ((_e as Error).message === "AUTH_REQUIRED") {
        toast.error("Sign in to save favourites");
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  // ── Cart mutation ──────────────────────────────────────────────────────────
  const cartMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      toast.success("Added to cart!", {
        message: `${quantity}× ${product.name}`,
      });
      posthog.capture("product_added_to_cart", {
        product_id: product.id,
        product_name: product.name,
        price_kes: product.priceKes,
        quantity,
        source: "detail_page",
      });
    },
    onError: () => toast.error("Could not add to cart"),
  });

  // ── Related products query ─────────────────────────────────────────────────
  const { data: relatedData, isLoading: relatedLoading } =
    useQuery<RelatedResponse>({
      queryKey: ["relatedProducts", product.categorySlug],
      queryFn: () =>
        fetch(
          `/api/storefront/products?category=${product.categorySlug}&limit=4`,
        ).then((r) => r.json()),
      staleTime: 60_000,
    });

  // Filter out the current product from recommendations
  const relatedProducts =
    relatedData?.data?.items?.filter((p) => p.slug !== product.slug) ?? [];

  useEffect(() => {
    posthog.capture("product_viewed", {
      product_id: product.id,
      product_name: product.name,
      price_kes: product.priceKes,
      category: product.categorySlug,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section className="px-4 md:px-8 lg:px-16 py-10 max-w-[1400px] mx-auto">
      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center flex-wrap gap-1.5 font-body text-[13px]"
        style={{ color: "#40493c" }}
      >
        <Link
          href="/"
          className="hover:underline transition-colors"
          style={{ color: "#40493c" }}
        >
          Home
        </Link>
        <span className="select-none">›</span>
        <Link
          href="/shop"
          className="hover:underline transition-colors"
          style={{ color: "#40493c" }}
        >
          Shop
        </Link>
        <span className="select-none">›</span>
        <Link
          href={`/shop?category=${product.categorySlug}`}
          className="hover:underline transition-colors"
          style={{ color: "#40493c" }}
        >
          {product.categoryName}
        </Link>
        <span className="select-none">›</span>
        <span
          className="font-semibold"
          style={{ color: "#1a1c1c" }}
          aria-current="page"
        >
          {product.name}
        </span>
      </nav>

      {/* ── Main product section ─────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-10 mt-8">
        {/* ── Left: image gallery ────────────────────────────────────────────── */}
        <div className="w-full lg:w-[52%] flex flex-col gap-4">
          {/* Large image */}
          <div
            className="relative h-[400px] md:h-[520px] rounded-[24px] overflow-hidden"
            style={{ background: "#f6f6f6" }}
          >
            <Image
              src={activeImageUrl}
              alt={activeImageAlt}
              fill
              className="object-contain"
              priority
              sizes="(max-width: 1024px) 100vw, 52vw"
            />

            {/* Discount badge overlay */}
            {hasDiscount && (
              <span
                className="absolute top-4 left-4 z-10 font-body text-[12px] font-bold px-3 py-1.5 rounded-full"
                style={{ background: "#27731e", color: "#fff" }}
              >
                {pct}% OFF
              </span>
            )}

            {/* Best Seller badge (when no discount) */}
            {product.bestSeller && !hasDiscount && (
              <span
                className="absolute top-4 left-4 z-10 font-body text-[12px] font-bold px-3 py-1.5 rounded-full"
                style={{ background: "#fec700", color: "#1a1c1c" }}
              >
                Best Seller
              </span>
            )}
          </div>

          {/* Thumbnail strip — only shown when there are multiple images */}
          {product.images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  aria-label={`View image ${i + 1}`}
                  className="flex-shrink-0 w-16 h-16 rounded-[10px] overflow-hidden transition-all duration-200"
                  style={{
                    border: `2px solid ${selectedImage === i ? "#27731e" : "transparent"}`,
                    background: "#f6f6f6",
                    outline: "none",
                  }}
                >
                  <Image
                    src={img.url}
                    alt={img.alt}
                    width={64}
                    height={64}
                    className="object-contain w-full h-full"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: product info ────────────────────────────────────────────── */}
        <motion.div
          className="w-full lg:w-[48%] flex flex-col gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          {/* Category chip */}
          <span
            className="font-body text-[12px] font-medium px-3 py-1 rounded-full w-fit"
            style={{ background: "#e8fce3", color: "#27731e" }}
          >
            {product.categoryName}
          </span>

          {/* Product name */}
          <h1
            className="font-heading font-semibold leading-tight"
            style={{
              color: "#1a1c1c",
              fontSize: "clamp(28px, 5vw, 42px)",
              letterSpacing: "-0.8px",
            }}
          >
            {product.name}
          </h1>

          {/* Variant label */}
          {product.variantLabel && (
            <p className="font-body text-[14px]" style={{ color: "#40493c" }}>
              {product.variantLabel}
            </p>
          )}

          {/* Star rating */}
          <StarRow rating={product.ratingAvg} count={product.ratingCount} />

          {/* Price block */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="font-body font-bold text-[32px]"
              style={{ color: "#1a1c1c" }}
            >
              {format(product.priceKes)}
            </span>
            {hasDiscount && (
              <>
                <span
                  className="font-body text-[18px] line-through"
                  style={{ color: "#a1a1a1" }}
                >
                  {format(product.compareAtPriceKes!)}
                </span>
                <span
                  className="font-body text-[12px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "#e8fce3", color: "#27731e" }}
                >
                  Save {pct}%
                </span>
              </>
            )}
          </div>

          {/* Stock badge */}
          <StockBadge stock={product.stock} />

          {/* Divider */}
          <hr style={{ borderColor: "#c0cab8", margin: "2px 0" }} />

          {/* Quantity stepper + Add to Cart */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Stepper */}
            <div
              className="flex items-center h-[48px] w-[120px] rounded-[8px]"
              style={{ border: "1px solid #c0cab8" }}
            >
              <button
                onClick={decQty}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
                className="flex-1 h-full flex items-center justify-center font-body text-[18px] transition-colors hover:bg-gray-50 rounded-l-[8px] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: "#1a1c1c" }}
              >
                −
              </button>
              <span
                className="w-10 text-center font-body text-[15px] font-semibold select-none"
                style={{ color: "#1a1c1c" }}
              >
                {quantity}
              </span>
              <button
                onClick={incQty}
                disabled={quantity >= maxQty}
                aria-label="Increase quantity"
                className="flex-1 h-full flex items-center justify-center font-body text-[18px] transition-colors hover:bg-gray-50 rounded-r-[8px] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: "#1a1c1c" }}
              >
                +
              </button>
            </div>

            {/* Add to Cart button */}
            <button
              onClick={() => cartMutation.mutate()}
              disabled={cartMutation.isPending || product.stock === 0}
              className="flex-1 h-[48px] rounded-[40px] font-body font-semibold text-[15px] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "#27731e",
                color: "#fff",
                minWidth: "160px",
              }}
              onMouseEnter={(e) => {
                if (!cartMutation.isPending && product.stock > 0)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "#045a03";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "#27731e";
              }}
              aria-label="Add to cart"
            >
              {cartMutation.isPending ? (
                <Spinner size={16} invert />
              ) : (
                <Icon icon="mdi:cart-plus" width={18} />
              )}
              {cartMutation.isPending ? "Adding…" : "Add to Cart"}
            </button>
          </div>

          {/* Wishlist button */}
          <button
            onClick={() => favMutation.mutate()}
            disabled={favMutation.isPending}
            className="self-start h-[48px] px-6 rounded-[40px] font-body text-[14px] flex items-center gap-2 transition-all duration-200 disabled:opacity-50"
            style={{
              border: `1px solid ${isFavorited ? "#27731e" : "#c0cab8"}`,
              color: isFavorited ? "#27731e" : "#1a1c1c",
            }}
            aria-label={isFavorited ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Icon
              icon={isFavorited ? "mdi:heart" : "mdi:heart-outline"}
              width={18}
              style={{ color: isFavorited ? "#c00" : "#c4c4c4" }}
            />
            {isFavorited ? "Saved to Wishlist" : "Add to Wishlist"}
          </button>

          {/* Product highlights */}
          <HighlightPills />

          {/* Divider */}
          <hr style={{ borderColor: "#c0cab8", margin: "2px 0" }} />

          {/* Description */}
          <div>
            <h2
              className="font-heading font-semibold text-[20px] mb-2"
              style={{ color: "#1a1c1c" }}
            >
              About this product
            </h2>
            <p
              className="font-body text-[15px] leading-[1.7]"
              style={{ color: "#40493c" }}
            >
              {product.description}
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── You May Also Like ─────────────────────────────────────────────────── */}
      <div className="mt-16">
        <h2
          className="font-heading font-semibold text-[28px] mb-6"
          style={{ color: "#1a1c1c", letterSpacing: "-0.5px" }}
        >
          You May Also Like
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center">
          {relatedLoading ? (
            // Loading skeletons — always render 4 placeholders
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-full max-w-[310px]">
                <SkeletonCard />
              </div>
            ))
          ) : relatedProducts.length > 0 ? (
            relatedProducts.map((p) => (
              <div key={p.id} className="w-full max-w-[310px]">
                <ProductCard product={p} />
              </div>
            ))
          ) : (
            // Empty state — no related products found
            <p
              className="col-span-full font-body text-[14px]"
              style={{ color: "#40493c" }}
            >
              No related products found.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
