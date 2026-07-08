"use client";

/**
 * ProductMultiSelect — controlled multi-select with search, modeled directly
 * on MultiCustomerSelect (pure React, no Preline dependency). Renders a
 * thumbnail + title + gray category subtext per option, and fetches its own
 * options from /api/products/options as the search query changes.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import CheckboxGreen from "@/components/ui/CheckboxGreen";

export interface ProductOption {
  id: string;
  name: string;
  category: string;
  image: string | null;
}

export interface ProductMultiSelectProps {
  /** Array of selected product IDs */
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

function Thumb({ product }: { product: ProductOption }) {
  return product.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={product.image}
      alt={product.name}
      className="w-8 h-8 rounded-md object-cover shrink-0 bg-neutral-100"
    />
  ) : (
    <div className="w-8 h-8 rounded-md bg-neutral-100 shrink-0" />
  );
}

export default function ProductMultiSelect({
  value,
  onChange,
  placeholder = "Select products you used…",
  className = "",
}: ProductMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [selectedCache, setSelectedCache] = useState<Record<string, ProductOption>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/products/options${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`)
        .then((r) => r.json())
        .then((json) => {
          if (cancelled || !json.ok) return;
          const list: ProductOption[] = json.data;
          setOptions(list);
          setSelectedCache((prev) => {
            const next = { ...prev };
            for (const p of list) next[p.id] = p;
            return next;
          });
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const toggle = useCallback(
    (id: string) => {
      const isSelected = value.includes(id);
      const next = isSelected ? value.filter((x) => x !== id) : [...value, id];
      onChange(next);
    },
    [value, onChange]
  );

  const selectedProducts = value.map((id) => selectedCache[id]).filter(Boolean) as ProductOption[];

  const displayList = [
    ...options.filter((p) => value.includes(p.id)),
    ...options.filter((p) => !value.includes(p.id)),
  ];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={`min-h-[46px] w-full px-3.5 py-2 flex flex-wrap gap-1.5 items-center rounded-[8px] border cursor-pointer border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-800 transition-colors ${open ? "border-[#27731e]" : ""}`}
      >
        {selectedProducts.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#e8f3e6] text-[#0b6b13] text-[12px] font-medium"
          >
            {p.name}
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(p.id);
              }}
              className="ml-0.5 text-[#0b6b13]/60 hover:text-red-600 transition-colors leading-none"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {selectedProducts.length === 0 && (
          <span className="text-[14px] text-neutral-400">{placeholder}</span>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-neutral-200 dark:border-gray-700 rounded-[10px] shadow-lg max-h-[300px] overflow-hidden flex flex-col">
          <div className="px-3 pt-3 pb-2 border-b border-neutral-100 dark:border-gray-800 shrink-0">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products…"
                className="w-full h-9 pl-8 pr-3 rounded-[6px] border border-neutral-200 dark:border-gray-700 bg-neutral-50 dark:bg-gray-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-[#27731e] transition-colors"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {displayList.length === 0 ? (
              <div className="px-4 py-5 text-center text-[13px] text-neutral-400">No products found</div>
            ) : (
              displayList.map((product) => {
                const isSelected = value.includes(product.id);
                return (
                  <div
                    key={product.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(product.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      isSelected ? "bg-[#f0fdf4] dark:bg-green-900/20" : "hover:bg-neutral-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    <CheckboxGreen checked={isSelected} />
                    <Thumb product={product} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-neutral-900 dark:text-white truncate">
                        {product.name}
                      </div>
                      <div className="text-[11px] text-neutral-400 truncate">{product.category}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
