"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
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

type CartResponse = {
  ok: boolean;
  data: { items: Array<{ productId: string; quantity: number }> };
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

/** Renders 5 stars from a numeric rating — no count shown. */
function StarRow({ rating }: { rating: number }) {
  const { full, half, empty } = getStarBreakdown(rating);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f-${i}`} type="full" />
      ))}
      {half === 1 && <Star type="half" />}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e-${i}`} type="empty" />
      ))}
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

/** Brand highlight pills */
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
  const [selectedSize, setSelectedSize] = useState<string | null>(product.sizes?.[0] ?? null);
  const [activeTab, setActiveTab] = useState<"description" | "howToUse" | "ingredients">("description");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [pendingQty, setPendingQty] = useState<number | null>(null);
  const qtyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (ctx?.prev) qc.setQueryData(["favorites"], ctx.prev);
      if ((_e as Error).message === "AUTH_REQUIRED") {
        toast.error("Sign in to save favourites");
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  // ── Cart query + mutations ─────────────────────────────────────────────────
  const { data: cartData } = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: () => fetch("/api/cart").then((r) => r.json()),
    staleTime: 30_000,
  });
  const cartItem = cartData?.data?.items?.find((i: { productId: string }) => i.productId === product.id);
  const cartQty = cartItem?.quantity ?? 0;
  const displayQty = pendingQty !== null ? pendingQty : cartQty;
  const showInCart = displayQty > 0;

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

  // ── Related products query ─────────────────────────────────────────────────
  const { data: relatedData, isLoading: relatedLoading } =
    useQuery<RelatedResponse>({
      queryKey: ["relatedProducts", product.categorySlug],
      queryFn: () =>
        fetch(
          `/api/storefront/products?category=${product.categorySlug}&limit=8`,
        ).then((r) => r.json()),
      staleTime: 60_000,
    });

  // Filter out the current product from recommendations
  const relatedProducts =
    relatedData?.data?.items?.filter((p) => p.slug !== product.slug) ?? [];

  // ── Scroll tracking for "Complete Your Routine" ───────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      setCanScrollLeft(el!.scrollLeft > 4);
      setCanScrollRight(el!.scrollLeft + el!.clientWidth < el!.scrollWidth - 4);
    }
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [relatedProducts]);

  // ── PostHog page view ──────────────────────────────────────────────────────
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
    <section className="px-4 md:px-8 lg:px-16 py-10 max-w-[1400px] mx-auto dark:text-gray-300">
      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center flex-wrap gap-1.5 font-body text-[13px] text-[#40493c] dark:text-gray-400"
      >
        <Link href="/" className="hover:underline transition-colors">Home</Link>
        <span className="select-none">›</span>
        <Link href="/shop" className="hover:underline transition-colors">Shop</Link>
        <span className="select-none">›</span>
        <Link href={`/shop?category=${product.categorySlug}`} className="hover:underline transition-colors">
          {product.categoryName}
        </Link>
        <span className="select-none">›</span>
        <span className="font-semibold text-[#1a1c1c] dark:text-white" aria-current="page">
          {product.name}
        </span>
      </nav>

      {/* ── Main product section ─────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-10 mt-8">
        {/* ── Left: image gallery ────────────────────────────────────────────── */}
        <div className="w-full lg:w-[52%] flex flex-col gap-4">
          {/* Large image with overlays */}
          <div className="relative h-[400px] md:h-[520px] rounded-[24px] overflow-hidden bg-[#f6f6f6] dark:bg-gray-800">
            <Image
              src={activeImageUrl}
              alt={activeImageAlt}
              fill
              className="object-contain"
              priority
              sizes="(max-width: 1024px) 100vw, 52vw"
            />

            {/* Discount badge — top left */}
            {hasDiscount && (
              <span
                className="absolute top-4 left-4 z-10 font-body text-[12px] font-bold px-3 py-1.5 rounded-full"
                style={{ background: "#27731e", color: "#fff" }}
              >
                {pct}% OFF
              </span>
            )}

            {/* Best Seller badge — top left, below discount (both can show) */}
            {product.bestSeller && (
              <span
                className="absolute left-4 z-10 font-body text-[12px] font-bold px-3 py-1.5 rounded-full"
                style={{ top: hasDiscount ? "52px" : "16px", background: "#fec700", color: "#1a1c1c" }}
              >
                Best Seller
              </span>
            )}

            {/* Favourite heart — top right */}
            <button
              onClick={() => favMutation.mutate()}
              disabled={favMutation.isPending}
              aria-label={isFavorited ? "Remove from wishlist" : "Add to wishlist"}
              className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform disabled:opacity-60"
              style={{ background: "rgba(255,255,255,0.9)" }}
            >
              <Icon
                icon={isFavorited ? "mdi:heart" : "mdi:heart-outline"}
                width={22}
                style={{ color: isFavorited ? "#c00" : "#c4c4c4" }}
              />
            </button>

            {/* Left chevron — hidden at first image */}
            {product.images.length > 1 && selectedImage > 0 && (
              <button
                onClick={() => setSelectedImage((i) => i - 1)}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center shadow transition hover:brightness-105"
                style={{ background: "rgba(255,255,255,0.85)" }}
              >
                <Icon icon="mdi:chevron-left" width={24} style={{ color: "#1a1c1c" }} />
              </button>
            )}

            {/* Right chevron — hidden at last image */}
            {product.images.length > 1 && selectedImage < product.images.length - 1 && (
              <button
                onClick={() => setSelectedImage((i) => i + 1)}
                aria-label="Next image"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center shadow transition hover:brightness-105"
                style={{ background: "rgba(255,255,255,0.85)" }}
              >
                <Icon icon="mdi:chevron-right" width={24} style={{ color: "#1a1c1c" }} />
              </button>
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
                  className="flex-shrink-0 w-16 h-16 rounded-[10px] overflow-hidden transition-all duration-200 bg-[#f6f6f6] dark:bg-gray-700"
                  style={{
                    border: `2px solid ${selectedImage === i ? "#27731e" : "transparent"}`,
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
            className="font-heading font-semibold leading-tight text-[#1a1c1c] dark:text-white"
            style={{ fontSize: "clamp(28px, 5vw, 42px)", letterSpacing: "-0.8px" }}
          >
            {product.name}
          </h1>

          {/* Variant label */}
          {product.variantLabel && (
            <p className="font-body text-[14px] text-[#40493c] dark:text-gray-400">
              {product.variantLabel}
            </p>
          )}

          {/* Star rating (stars only, no count) */}
          <StarRow rating={product.ratingAvg} />

          {/* Price block */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-body font-bold text-[32px] text-[#1a1c1c] dark:text-white">
              {format(product.priceKes)}
            </span>
            {hasDiscount && (
              <>
                <span className="font-body text-[18px] line-through" style={{ color: "#a1a1a1" }}>
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

          {/* Sizes picker */}
          {(product.sizes?.length ?? 0) > 0 && (
            <div>
              <p className="font-body text-[13px] font-medium mb-2" style={{ color: "#40493c" }}>
                Select Size
              </p>
              <div className="flex flex-wrap gap-2">
                {(product.sizes ?? []).map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className="px-4 py-2 rounded-[8px] border font-body text-[14px] transition-all"
                    style={{
                      borderColor: selectedSize === size ? "#27731e" : "#c0cab8",
                      background: selectedSize === size ? "#e8fce3" : "transparent",
                      color: selectedSize === size ? "#27731e" : "#1a1c1c",
                      fontWeight: selectedSize === size ? 600 : 400,
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stock badge */}
          <StockBadge stock={product.stock} />

          {/* Divider */}
          <hr className="dark:border-gray-700" style={{ borderColor: "#c0cab8", margin: "2px 0" }} />

          {/* Cart CTA */}
          <div className="flex flex-col gap-3">
            {/* Row 1: Add to Cart OR Go to Cart (same position, different state) */}
            <div className="flex items-center gap-3 flex-wrap">
              {!showInCart ? (
                <>
                  {/* Quantity stepper */}
                  <div className="flex items-center h-[48px] w-[120px] rounded-[8px] border border-[#c0cab8] dark:border-gray-600">
                    <button
                      onClick={decQty}
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                      className="flex-1 h-full flex items-center justify-center font-body text-[18px] transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 rounded-l-[8px] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ color: "#1a1c1c" }}
                    >
                      −
                    </button>
                    <span className="w-10 text-center font-body text-[15px] font-semibold select-none text-[#1a1c1c] dark:text-white">
                      {quantity}
                    </span>
                    <button
                      onClick={incQty}
                      disabled={quantity >= maxQty}
                      aria-label="Increase quantity"
                      className="flex-1 h-full flex items-center justify-center font-body text-[18px] transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 rounded-r-[8px] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ color: "#1a1c1c" }}
                    >
                      +
                    </button>
                  </div>
                  {/* Add to Cart */}
                  <button
                    onClick={handleAddToCart}
                    disabled={cartMutation.isPending || product.stock === 0}
                    className="flex-1 h-[48px] rounded-[40px] font-body font-semibold text-[15px] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: "#27731e", color: "#fff", minWidth: "160px" }}
                    onMouseEnter={(e) => {
                      if (!cartMutation.isPending && product.stock > 0)
                        (e.currentTarget as HTMLButtonElement).style.background = "#045a03";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "#27731e";
                    }}
                    aria-label="Add to cart"
                  >
                    {cartMutation.isPending ? <Spinner size={16} invert /> : <Icon icon="mdi:cart-plus" width={18} />}
                    {cartMutation.isPending ? "Adding…" : "Add to Cart"}
                  </button>
                </>
              ) : (
                /* Go to Cart — yellow, same slot as Add to Cart */
                <Link
                  href="/cart"
                  className="flex-1 h-[48px] rounded-[40px] font-body font-semibold text-[15px] flex items-center justify-center gap-2 transition-all duration-200 shadow-sm"
                  style={{ background: "#fec700", color: "#1a1c1c", minWidth: "160px" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#e5b600"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#fec700"; }}
                >
                  <Icon icon="mdi:cart-check" width={18} />
                  Go to Cart
                </Link>
              )}
            </div>

            {/* Row 2: Quantity input — own row, only when in cart */}
            {showInCart && (
              <div className="flex items-center gap-3">
                <div className="py-2 px-3 inline-flex bg-white dark:bg-gray-900 border border-[#c0cab8] dark:border-gray-600 rounded-[10px]">
                  <div className="flex items-center gap-x-2">
                    <button
                      type="button"
                      onClick={() => handleQtyChange(displayQty - 1)}
                      className="size-7 inline-flex justify-center items-center rounded-md border border-[#c0cab8] dark:border-gray-600 text-[#1a1c1c] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none transition-colors"
                      aria-label="Decrease cart quantity"
                    >
                      <svg className="shrink-0 size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14"/>
                      </svg>
                    </button>
                    <input
                      className="p-0 w-8 bg-transparent border-0 text-[#1a1c1c] dark:text-neutral-200 text-center focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none font-body text-[15px] font-semibold"
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
                      className="size-7 inline-flex justify-center items-center rounded-md border border-[#c0cab8] dark:border-gray-600 text-[#1a1c1c] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none transition-colors"
                      aria-label="Increase cart quantity"
                    >
                      <svg className="shrink-0 size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14"/>
                        <path d="M12 5v14"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <span className="font-body text-[13px]" style={{ color: "#40493c" }}>in your cart</span>
              </div>
            )}
          </div>

          {/* Product highlights */}
          <HighlightPills />

          {/* Divider */}
          <hr className="dark:border-gray-700" style={{ borderColor: "#c0cab8", margin: "2px 0" }} />

          {/* 3-tab toggle */}
          <div>
            {/* Tab bar */}
            <div className="flex border-b dark:border-gray-700" style={{ borderColor: "#c0cab8" }}>
              {(["description", "howToUse", "ingredients"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="font-body text-[14px] font-medium px-5 py-3 transition-colors"
                  style={{
                    borderBottom: activeTab === tab ? "2px solid #27731e" : "2px solid transparent",
                    color: activeTab === tab ? "#27731e" : "#40493c",
                    marginBottom: activeTab === tab ? "-1px" : undefined,
                  }}
                >
                  {tab === "description" ? "Description" : tab === "howToUse" ? "How to Use" : "Ingredients"}
                </button>
              ))}
            </div>
            {/* Tab content */}
            <div className="pt-4 pb-2">
              {activeTab === "description" && (
                <p className="font-body text-[15px] leading-[1.7]" style={{ color: "#40493c" }}>
                  {product.description}
                </p>
              )}
              {activeTab === "howToUse" && (
                product.howToUse
                  ? <p className="font-body text-[15px] leading-[1.7]" style={{ color: "#40493c" }}>{product.howToUse}</p>
                  : <p className="font-body text-[14px] italic" style={{ color: "#a1a1a1" }}>No information available.</p>
              )}
              {activeTab === "ingredients" && (
                product.ingredients
                  ? <p className="font-body text-[15px] leading-[1.7]" style={{ color: "#40493c" }}>{product.ingredients}</p>
                  : <p className="font-body text-[14px] italic" style={{ color: "#a1a1a1" }}>No information available.</p>
              )}
            </div>
          </div>

          {/* WhatsApp CTA */}
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-2 p-4 rounded-[16px]"
            style={{ background: "#f0fdf0", border: "1px solid #c4e8be" }}
          >
            <p className="font-body text-[13px]" style={{ color: "#40493c" }}>
              Prefer to order on WhatsApp?
            </p>
            <a
              href={`https://wa.me/254768151505?text=${encodeURIComponent(`Hi! I'd like to order: ${product.name}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                posthog.capture("whatsapp_order_product_clicked", {
                  product_id: product.id,
                  product_name: product.name,
                })
              }
              className="flex items-center gap-2 h-[44px] px-5 rounded-[40px] font-body font-semibold text-[14px] text-white flex-shrink-0"
              style={{ background: "#25D366" }}
            >
              <Icon icon="mdi:whatsapp" width={20} />
              Order via WhatsApp
            </a>
          </div>
        </motion.div>
      </div>

      {/* ── Complete Your Routine ─────────────────────────────────────────────── */}
      <div className="mt-16 relative">
        <h2
          className="font-heading font-semibold text-[28px] mb-6 text-[#1a1c1c] dark:text-white"
          style={{ letterSpacing: "-0.5px" }}
        >
          Complete Your Routine
        </h2>

        <div className="relative">
          {/* Left chevron */}
          {canScrollLeft && (
            <button
              onClick={() => scrollRef.current?.scrollBy({ left: -320, behavior: "smooth" })}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 -translate-x-4 w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow flex items-center justify-center hover:shadow-md transition"
              aria-label="Scroll left"
            >
              <Icon icon="mdi:chevron-left" width={24} style={{ color: "#1a1c1c" }} />
            </button>
          )}

          {/* Right chevron */}
          {canScrollRight && (
            <button
              onClick={() => scrollRef.current?.scrollBy({ left: 320, behavior: "smooth" })}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 translate-x-4 w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow flex items-center justify-center hover:shadow-md transition"
              aria-label="Scroll right"
            >
              <Icon icon="mdi:chevron-right" width={24} style={{ color: "#1a1c1c" }} />
            </button>
          )}

          {/* Scrollable container */}
          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto pb-4 scroll-smooth"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {relatedLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[280px]">
                    <SkeletonCard />
                  </div>
                ))
              : relatedProducts.length > 0
                ? relatedProducts.map((p) => (
                    <div key={p.id} className="flex-shrink-0 w-[280px]">
                      <ProductCard product={p} />
                    </div>
                  ))
                : (
                  <p className="font-body text-[14px]" style={{ color: "#40493c" }}>
                    No related products found.
                  </p>
                )}
          </div>
        </div>
      </div>
    </section>
  );
}
