"use client";

/**
 * ProductPickerDropdown — search + result list for adding products to the
 * in-store order cart (NewOrderClient's "Products" step).
 *
 * Backed by GET /api/admin/products, which already returns the full catalog
 * with category + images and has no pagination — filtering happens
 * client-side since the catalog is small at this scale (same assumption
 * AdminProductsClient.tsx makes for its grid/list views).
 *
 * Purely presentational: clicking a row calls onAddProduct and lets the
 * caller (NewOrderClient) decide whether to create a new cart line or
 * increment an existing one. Nothing here touches the database — the cart
 * is local component state until the order is actually submitted.
 */

import { useMemo, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Plus, Search } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PickerProduct {
  id: string;
  name: string;
  categoryName: string | null;
  priceKes: number;
  imageUrl: string | null;
}

type RawProductImage = { objectKey: string; isPrimary: boolean; sortOrder: number };
type RawProduct = {
  id: string;
  name: string;
  priceKes: number;
  category: { name: string } | null;
  images: RawProductImage[];
};

interface ProductPickerDropdownProps {
  onAddProduct: (product: PickerProduct) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Client-safe R2 object-key -> public URL resolution — mirrors lib/r2.ts's
// r2PublicUrl() without importing it directly, since that module also pulls
// in the AWS SDK S3Client which is server-only. Same pattern AdminProductsClient
// uses for its own imageUrl() helper.
const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
function resolveImageUrl(objectKey: string | undefined): string | null {
  if (!objectKey) return null;
  if (objectKey.startsWith("http://") || objectKey.startsWith("https://")) return objectKey;
  if (objectKey.startsWith("/")) return objectKey;
  if (objectKey.startsWith("img/")) return `/${objectKey}`;
  return `${R2_BASE.replace(/\/$/, "")}/${objectKey}`;
}

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ProductPickerDropdown({ onAddProduct }: ProductPickerDropdownProps) {
  const [query, setQuery] = useState("");

  const { data: products = [], isLoading, isError } = useQuery<PickerProduct[]>({
    queryKey: ["admin-products-picker"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/products");
        const json = await res.json();
        const raw = (json?.data?.products ?? []) as RawProduct[];
        return raw.map((p) => {
          const primary = p.images.find((i) => i.isPrimary) ?? p.images[0];
          return {
            id: p.id,
            name: p.name,
            categoryName: p.category?.name ?? null,
            priceKes: p.priceKes,
            imageUrl: resolveImageUrl(primary?.objectKey),
          };
        });
      } catch (err) {
        console.error("[ProductPickerDropdown] failed to load products", err);
        throw err;
      }
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? products
      : products.filter(
          (p) => p.name.toLowerCase().includes(q) || (p.categoryName ?? "").toLowerCase().includes(q)
        );
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, query]);

  return (
    <div className="rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) overflow-hidden">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 border-b border-(--neutral-100) dark:border-(--dark-border)">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products by name or category…"
            className="w-full h-9 pl-8 pr-3 rounded-[6px] border border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-800) placeholder:text-(--neutral-400) transition-colors"
          />
        </div>
      </div>

      {/* Results — fixed height showing ~5 rows, internal scroll for more */}
      <div className="h-[360px] overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center font-dm text-[13px] text-(--neutral-400)">Loading products…</div>
        ) : isError ? (
          <div className="px-4 py-8 text-center font-dm text-[13px] text-(--danger)">Could not load products</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center font-dm text-[13px] text-(--neutral-400)">
            {query.trim() ? "No products found" : "No products yet"}
          </div>
        ) : (
          filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onAddProduct(product)}
              className="w-full flex items-center gap-3 px-3 h-[72px] text-left hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg) transition-colors border-b border-(--neutral-100) dark:border-(--dark-border) last:border-b-0"
            >
              <div className="w-11 h-11 rounded-[6px] bg-(--neutral-100) dark:bg-(--dark-bg) shrink-0 overflow-hidden relative">
                {product.imageUrl ? (
                  <Image src={product.imageUrl} alt={product.name} fill className="object-cover" sizes="44px" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-(--neutral-300)">
                    <ImageOff size={16} />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">
                  {product.name}
                </p>
                {product.categoryName && (
                  <p className="font-dm text-[11px] text-(--neutral-400) truncate">{product.categoryName}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-dm text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                  {formatKes(product.priceKes)}
                </span>
                <span className="w-6 h-6 rounded-full bg-(--green-50) dark:bg-green-900/20 text-(--green-800) flex items-center justify-center">
                  <Plus size={13} />
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
