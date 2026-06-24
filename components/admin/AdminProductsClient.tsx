"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Grid, List, ChevronDown, Star, MoreHorizontal,
  Pencil, Copy, ExternalLink, Trash2, Check, X, ImagePlus,
  GripVertical, Tag, RefreshCw,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";
import { ScreenLoader } from "@/components/admin/ui/ScreenLoader";
import Switch from "@/components/ui/Switch";
import CircularProgress from "@/components/ui/CircularProgress";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ProductImage = {
  id: string;
  objectKey: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
};

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  categoryId: string;
  category: { id: string; name: string; slug: string } | null;
  priceKes: number;
  compareAtPriceKes: number | null;
  variantLabel: string | null;
  bestSeller: boolean;
  isActive: boolean;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  images: ProductImage[];
};

type Category = { id: string; name: string; slug: string };

type DrawerFormData = {
  // Basic info
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  // Pricing
  categoryId: string;
  // E1: stored as digits-only string (e.g. "120000" = KES 1,200.00 in cents)
  priceKes: string;
  compareAtPriceKes: string;
  variantLabel: string;
  // Inventory
  stock: string;
  bestSeller: boolean;
  isActive: boolean;
  // Images (objectKeys in order, index 0 = primary)
  imageKeys: string[];
  // SEO
  seoTitle: string;
  metaDescription: string;
};

type ViewMode = "grid" | "list";
type SortOption = "newest" | "oldest" | "price-asc" | "price-desc" | "name-asc" | "stock-asc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

function imageUrl(objectKey: string | undefined): string | null {
  if (!objectKey) return null;
  if (objectKey.startsWith("http://") || objectKey.startsWith("https://")) return objectKey;
  if (objectKey.startsWith("/")) return objectKey;
  if (objectKey.startsWith("img/")) return `/${objectKey}`;
  return `${R2_BASE.replace(/\/$/, "")}/${objectKey}`;
}

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE")}`;
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getPrimaryImage(images: ProductImage[]): string | null {
  const primary = images.find((i) => i.isPrimary) ?? images[0];
  return imageUrl(primary?.objectKey);
}

// ---------------------------------------------------------------------------
// E1: Price mask helpers
// ---------------------------------------------------------------------------
/**
 * Converts a digits-only string (representing cents) to a display string.
 * "120000" → "1,200.00"
 * "100"    → "1.00"
 * "1"      → "0.01"
 * ""       → ""
 */
function formatPrice(digits: string): string {
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  if (isNaN(cents)) return "";
  // Divide by 100 to get the decimal value, then format with 2 decimal places
  return (cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Hook that manages a price field stored as a digits-only cents string.
 * Returns { digits, display, onKeyDown, onFocus, onBlur }
 * to spread onto a controlled <input type="text" inputMode="numeric">.
 */
function usePriceMask(
  digits: string,
  setDigits: (d: string) => void,
) {
  const [focused, setFocused] = useState(false);

  // While focused show the raw formatted value; while blurred show same but without cursor artifacts
  const display = formatPrice(digits);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      // Append digit (max ~15 digits to avoid precision loss)
      if (digits.length < 15) {
        setDigits(digits + e.key);
      }
    } else if (e.key === "Backspace") {
      e.preventDefault();
      setDigits(digits.slice(0, -1));
    } else if (e.key === "Delete") {
      e.preventDefault();
      setDigits("");
    }
    // All other keys (Tab, arrows, etc.) pass through unchanged
  }

  // Prevent paste of non-digit characters
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const raw = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
    if (!raw) return;
    const combined = (digits + raw).slice(0, 15);
    setDigits(combined);
  }

  return {
    value: display,
    onKeyDown,
    onPaste,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    // Prevent native onChange from doing anything — we manage state in onKeyDown
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { e.preventDefault(); },
    readOnly: false,
    type: "text" as const,
    inputMode: "numeric" as const,
    pattern: "[0-9]*",
    focused,
  };
}

function blankForm(): DrawerFormData {
  return {
    name: "", slug: "", description: "", shortDescription: "",
    categoryId: "", priceKes: "", compareAtPriceKes: "", variantLabel: "",
    stock: "0", bestSeller: false, isActive: true,
    imageKeys: [], seoTitle: "", metaDescription: "",
  };
}

function productToForm(p: AdminProduct): DrawerFormData {
  const sortedImages = [...p.images].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  return {
    name: p.name, slug: p.slug, description: p.description,
    shortDescription: p.shortDescription ?? "",
    categoryId: p.categoryId,
    // E1: store prices as digits (cents) string — priceKes is already in cents
    priceKes: p.priceKes > 0 ? String(p.priceKes) : "",
    compareAtPriceKes: p.compareAtPriceKes != null && p.compareAtPriceKes > 0
      ? String(p.compareAtPriceKes)
      : "",
    variantLabel: p.variantLabel ?? "",
    stock: String(p.stock), bestSeller: p.bestSeller, isActive: p.isActive,
    imageKeys: sortedImages.map((i) => i.objectKey),
    seoTitle: "", metaDescription: "",
  };
}

// ---------------------------------------------------------------------------
// Stock pill (floating on card)
// ---------------------------------------------------------------------------
function StockPill({ stock }: { stock: number }) {
  const cfg =
    stock === 0
      ? "bg-(--danger-bg) text-(--danger)"
      : stock < 10
      ? "bg-(--gold-100) text-(--gold-700)"
      : "bg-(--green-50) text-(--success)";
  return (
    <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-dm font-medium ${cfg}`}>
      {stock === 0 ? "Out" : stock < 10 ? `Low: ${stock}` : stock}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 3-dot card menu
// ---------------------------------------------------------------------------
function CardMenu({
  product,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  product: AdminProduct;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 flex items-center justify-center rounded-[6px] text-(--neutral-500) hover:bg-(--neutral-100) transition-colors"
        aria-label="Product actions"
      >
        <MoreHorizontal size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 bottom-full mb-1 w-44 bg-white rounded-[10px] shadow-(--e3) border border-(--neutral-200) z-20 overflow-hidden py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              <Pencil size={14} /> Edit
            </button>
            <button
              onClick={() => { setOpen(false); onDuplicate(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              <Copy size={14} /> Duplicate
            </button>
            <a
              href={`/shop/${product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              onClick={() => setOpen(false)}
            >
              <ExternalLink size={14} /> View on Store
            </a>
            <div className="h-px bg-(--neutral-200) mx-2 my-1" />
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--danger) hover:bg-(--danger-bg) transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------
function ProductGridCard({
  product,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  product: AdminProduct;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const imgSrc = getPrimaryImage(product.images);
  const savePct =
    product.compareAtPriceKes && product.compareAtPriceKes > product.priceKes
      ? Math.round(((product.compareAtPriceKes - product.priceKes) / product.compareAtPriceKes) * 100)
      : null;

  return (
    <div
      onClick={onEdit}
      className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--green-200) dark:border-(--dark-border) shadow-(--e1) overflow-hidden cursor-pointer hover:shadow-(--e2) hover:border-(--green-500) dark:hover:border-(--dark-accent) transition-all group"
    >
      {/* Image */}
      <div className="relative aspect-square bg-(--green-50) dark:bg-(--dark-bg)">
        {imgSrc ? (
          <Image src={imgSrc} alt={product.name} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="220px" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-(--green-50) dark:bg-(--dark-bg)">
            <ImagePlus size={34} className="text-(--green-500) dark:text-(--dark-accent)" />
          </div>
        )}
        <StockPill stock={product.stock} />
        {savePct && (
          <span className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-dm font-medium bg-(--gold-100) text-(--gold-700)">
            -{savePct}%
          </span>
        )}
        {!product.isActive && (
          <div className="absolute inset-0 bg-white/65 dark:bg-black/55 flex items-center justify-center">
            <span className="bg-(--neutral-700) text-white rounded-full px-2 py-0.5 text-[11px] font-dm">Inactive</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-syne text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text) leading-snug line-clamp-1 mb-0.5">
          {product.name}
        </p>
        <p className="font-dm text-[12px] text-(--green-800) dark:text-(--dark-muted) mb-1.5">
          {product.category?.name ?? "—"}
        </p>
        <div className="flex items-center justify-between">
          <p className="font-dm text-[15px] font-semibold text-(--green-900) dark:text-(--dark-accent)">
            {formatKes(product.priceKes)}
          </p>
          <div className="flex items-center gap-1">
            {product.ratingCount > 0 && (
              <span className="font-dm text-[12px] text-(--gold-700) flex items-center gap-0.5">
                <Star size={11} fill="currentColor" />
                {product.ratingAvg.toFixed(1)}
              </span>
            )}
            {/* 3-dot menu — stop click propagation from card's onEdit */}
            <div onClick={(e) => e.stopPropagation()}>
              <CardMenu
                product={product}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// E3: Category dropdown with inline "Add category"
// ---------------------------------------------------------------------------
function CategoryDropdown({
  value,
  onChange,
  categories,
  onCategoryAdded,
}: {
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  onCategoryAdded: (cat: Category) => void;
}) {
  const [open, setOpen] = useState(false);
  // "list" = showing options, "add" = showing inline add input
  const [mode, setMode] = useState<"list" | "add">("list");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMode("list");
        setNewName("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus input when switching to add mode
  useEffect(() => {
    if (mode === "add" && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [mode]);

  const selectedCategory = categories.find((c) => c.id === value);

  async function handleConfirmAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      // POST to the categories API — Stream D owns this endpoint
      const res = await fetch("/api/admin/products/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not add category");
        return;
      }
      // Expect the API to return the new category object
      const newCat: Category = json.data ?? json;
      onCategoryAdded(newCat);
      onChange(newCat.id);
      toast.success(`Category "${newCat.name}" added`);
      setOpen(false);
      setMode("list");
      setNewName("");
    } catch {
      toast.error("Failed to add category");
    } finally {
      setAdding(false);
    }
  }

  function handleCancelAdd() {
    setMode("list");
    setNewName("");
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setMode("list"); }}
        className="w-full font-dm text-[14px] text-(--neutral-900) rounded-[8px] border border-(--neutral-200) bg-white px-3 py-2 focus:outline-none focus:border-(--green-800) transition-colors text-left flex items-center justify-between"
        style={{ minHeight: "38px" }}
      >
        <span className={selectedCategory ? "text-(--neutral-900)" : "text-(--neutral-400)"}>
          {selectedCategory ? selectedCategory.name : "Select a category"}
        </span>
        <ChevronDown
          size={14}
          className={`text-(--neutral-400) transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.13 }}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-[10px] border border-(--neutral-200) shadow-(--e3) z-30 overflow-hidden"
          >
            {mode === "list" ? (
              <div className="py-1 max-h-56 overflow-y-auto">
                {/* Add category button — always first */}
                <button
                  type="button"
                  onClick={() => setMode("add")}
                  className="w-full flex items-center justify-center gap-2 mx-2 my-1 rounded-[7px] border-2 border-dashed border-(--neutral-300) py-2 font-dm text-[13px] text-(--neutral-500) hover:border-(--green-800) hover:text-(--green-800) transition-colors"
                  style={{ width: "calc(100% - 16px)" }}
                >
                  <Plus size={14} />
                  Add category
                </button>

                {/* Divider */}
                {categories.length > 0 && (
                  <div className="h-px bg-(--neutral-100) mx-2 my-1" />
                )}

                {/* Existing category options */}
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { onChange(cat.id); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 font-dm text-[13px] transition-colors ${
                      cat.id === value
                        ? "text-(--green-800) bg-(--green-50)"
                        : "text-(--neutral-700) hover:bg-(--neutral-50)"
                    }`}
                  >
                    {cat.id === value && <Check size={13} className="shrink-0" />}
                    <span className={cat.id === value ? "ml-0" : "ml-[17px]"}>{cat.name}</span>
                  </button>
                ))}

                {categories.length === 0 && (
                  <p className="px-3 py-2 font-dm text-[12px] text-(--neutral-400)">No categories yet</p>
                )}
              </div>
            ) : (
              /* Inline add mode */
              <div className="p-3 flex flex-col gap-2">
                <p className="font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.5px]">
                  New category
                </p>
                <input
                  ref={addInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleConfirmAdd(); }
                    if (e.key === "Escape") handleCancelAdd();
                  }}
                  placeholder="e.g. Face Care"
                  className="w-full font-dm text-[14px] text-(--neutral-900) rounded-[7px] border border-(--neutral-200) bg-white px-3 py-2 focus:outline-none focus:border-(--green-800) transition-colors placeholder:text-(--neutral-400)"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmAdd}
                    disabled={adding || !newName.trim()}
                    className="flex-1 h-8 rounded-[7px] bg-(--green-800) font-dm text-[13px] text-white flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {adding ? <Spinner size={12} /> : <Check size={13} />}
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelAdd}
                    disabled={adding}
                    className="flex-1 h-8 rounded-[7px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-600) hover:bg-(--neutral-50) transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// E4: Image upload grid with per-slot XHR progress rings
// ---------------------------------------------------------------------------
function ImageUploadGrid({
  imageKeys,
  onChange,
}: {
  imageKeys: string[];
  onChange: (keys: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Map of in-flight upload index → percent (0–100). null = not uploading.
  const [uploadPercents, setUploadPercents] = useState<Record<number, number>>({});
  // Drag-to-reorder state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const isUploading = Object.keys(uploadPercents).length > 0;

  function setSlotPercent(slotIdx: number, percent: number | null) {
    setUploadPercents((prev) => {
      if (percent === null) {
        const next = { ...prev };
        delete next[slotIdx];
        return next;
      }
      return { ...prev, [slotIdx]: percent };
    });
  }

  /**
   * Upload a single file via XHR so we can track real upload progress.
   * Returns the objectKey from the server on success, or null on failure.
   */
  function uploadFile(file: File, slotIdx: number): Promise<string | null> {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "products");

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setSlotPercent(slotIdx, pct);
        }
      });

      xhr.addEventListener("load", () => {
        setSlotPercent(slotIdx, null);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            resolve(json.objectKey ?? null);
          } catch {
            toast.error("Upload response parse error");
            resolve(null);
          }
        } else {
          try {
            const json = JSON.parse(xhr.responseText);
            toast.error(json.error ?? "Upload failed");
          } catch {
            toast.error("Upload failed");
          }
          resolve(null);
        }
      });

      xhr.addEventListener("error", () => {
        setSlotPercent(slotIdx, null);
        toast.error("Upload failed. Please try again.");
        resolve(null);
      });

      xhr.addEventListener("abort", () => {
        setSlotPercent(slotIdx, null);
        resolve(null);
      });

      xhr.open("POST", "/api/admin/upload?category=products");
      xhr.send(formData);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (imageKeys.length + files.length > 8) {
      toast.error("Maximum 8 images per product");
      return;
    }

    const startIdx = imageKeys.length;
    const newKeys: string[] = [];

    // Upload files sequentially so slot indices are predictable
    for (let i = 0; i < files.length; i++) {
      const slotIdx = startIdx + i;
      const key = await uploadFile(files[i], slotIdx);
      if (key) newKeys.push(key);
    }

    if (newKeys.length) {
      onChange([...imageKeys, ...newKeys]);
      toast.success(`${newKeys.length} image${newKeys.length > 1 ? "s" : ""} uploaded`);
    }

    if (fileRef.current) fileRef.current.value = "";
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const newKeys = [...imageKeys];
    const [moved] = newKeys.splice(dragIdx, 1);
    newKeys.splice(targetIdx, 0, moved);
    onChange(newKeys);
    setDragIdx(null);
    setOverIdx(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Thumbnails grid */}
      <div className="flex flex-wrap gap-2">
        {imageKeys.map((key, idx) => {
          const src = imageUrl(key);
          const isPrimary = idx === 0;
          return (
            <div
              key={key}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              className={`relative w-[72px] h-[72px] rounded-[8px] overflow-hidden border-2 transition-all cursor-grab ${
                overIdx === idx ? "border-(--green-800) scale-105" : isPrimary ? "border-(--green-800)" : "border-(--neutral-200)"
              }`}
            >
              {src ? (
                <Image src={src} alt="" fill className="object-cover" sizes="72px" />
              ) : (
                <div className="w-full h-full bg-(--neutral-100) flex items-center justify-center">
                  <Tag size={20} className="text-(--neutral-300)" />
                </div>
              )}
              {/* Primary badge */}
              {isPrimary && (
                <span className="absolute bottom-0 left-0 right-0 bg-(--green-800)/80 text-white text-[9px] font-dm text-center py-0.5">
                  Primary
                </span>
              )}
              {/* Drag handle */}
              <div className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100">
                <GripVertical size={12} className="text-white drop-shadow" />
              </div>
              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(imageKeys.filter((_, i) => i !== idx)); }}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-(--danger) hover:bg-white shadow-sm"
                aria-label="Remove image"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Add / upload slot — shows CircularProgress ring while a file is uploading into this slot */}
        {imageKeys.length < 8 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="w-[72px] h-[72px] rounded-[8px] border-2 border-dashed border-(--neutral-300) flex flex-col items-center justify-center gap-1 text-(--neutral-400) hover:border-(--green-800) hover:text-(--green-800) transition-colors disabled:opacity-50 relative overflow-hidden"
          >
            {isUploading ? (
              /* Show the highest active upload percent in the add slot */
              <CircularProgress
                percent={Math.max(...Object.values(uploadPercents))}
                size={44}
                strokeWidth={4}
              />
            ) : (
              <>
                <ImagePlus size={18} />
                <span className="text-[10px] font-dm">Add</span>
              </>
            )}
          </button>
        )}
      </div>
      <p className="font-dm text-[11px] text-(--neutral-400)">
        Drag to reorder. First image is primary. Max 8 images.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared input / label classes
// ---------------------------------------------------------------------------
const inputCls =
  "w-full font-dm text-[14px] text-(--neutral-900) rounded-[8px] border border-(--neutral-200) bg-white px-3 py-2 focus:outline-none focus:border-(--green-800) transition-colors placeholder:text-(--neutral-400)";
const labelCls = "block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5";
const sectionTitleCls = "font-syne text-[15px] font-semibold text-(--neutral-900) mb-3";

// ---------------------------------------------------------------------------
// E1: Masked price input component
// ---------------------------------------------------------------------------
function PriceInput({
  label,
  digits,
  setDigits,
  placeholder,
  required,
}: {
  label: string;
  digits: string;
  setDigits: (d: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const maskProps = usePriceMask(digits, setDigits);
  const isEmpty = !digits;

  return (
    <div>
      <label className={labelCls}>{label}{required && " *"}</label>
      <div className="relative">
        {/* KES prefix */}
        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-dm text-[13px] text-(--neutral-400) pointer-events-none select-none">
          KES
        </span>
        <input
          className={`${inputCls} pl-10`}
          placeholder={placeholder ?? "0.00"}
          {...maskProps}
          // Display value: formatted if we have digits, empty otherwise
          value={maskProps.value}
        />
        {/* Show formatted preview suffix in placeholder style when empty */}
      </div>
      {!isEmpty && (
        <p className="font-dm text-[11px] text-(--neutral-400) mt-0.5">
          {formatPrice(digits)} KES
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Drawer (640px)
// ---------------------------------------------------------------------------
function ProductDrawer({
  open, onClose, editing, form, onChange, onSaveActive, onSaveDraft, isPending, categories, onCategoryAdded,
}: {
  open: boolean;
  onClose: () => void;
  editing: AdminProduct | null;
  form: DrawerFormData;
  onChange: (patch: Partial<DrawerFormData>) => void;
  onSaveActive: () => void;
  onSaveDraft: () => void;
  isPending: boolean;
  categories: Category[];
  onCategoryAdded: (cat: Category) => void;
}) {
  const isNew = editing === null;

  // Auto-slug from name only when creating new product and user hasn't manually edited slug
  const slugEdited = useRef(false);
  useEffect(() => {
    if (!isNew) return;
    if (!slugEdited.current && form.name) {
      onChange({ slug: slugify(form.name) });
    }
  }, [form.name, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // E2: local UI state for showing the savings badge toggle
  const [showSavingsBadge, setShowSavingsBadge] = useState(false);

  // E2: Compute the savings percentage from the digits buffers
  const priceInCents = form.priceKes ? parseInt(form.priceKes, 10) : 0;
  const compareInCents = form.compareAtPriceKes ? parseInt(form.compareAtPriceKes, 10) : 0;
  const savePercent =
    compareInCents > 0 && priceInCents > 0 && compareInCents > priceInCents
      ? Math.round(((compareInCents - priceInCents) / compareInCents) * 100)
      : null;

  // Reset showSavingsBadge if compare price becomes invalid
  useEffect(() => {
    if (!savePercent) setShowSavingsBadge(false);
  }, [savePercent]);

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        className="h-9 px-4 rounded-[8px] border border-[#ff4545] font-dm text-[13px] text-[#ee2400] hover:bg-(--neutral-50) transition-colors disabled:opacity-50 mr-5"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSaveDraft}
        disabled={isPending}
        className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {isPending ? <Spinner size={14} /> : null}
        Save as Draft
      </button>
      <button
        type="button"
        onClick={onSaveActive}
        disabled={isPending}
        className="h-9 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
      >
        {isPending ? <Spinner size={14} /> : null}
        {isNew ? "Publish" : "Save Changes"}
      </button>
    </>
  );

  return (
    <Drawer open={open} onClose={onClose} title={isNew ? "Add Product" : "Edit Product"} width={640} footer={footer}>
      <div className="flex flex-col gap-7">

        {/* ── 1. Basic Info ── */}
        <section>
          <h3 className={sectionTitleCls}>Basic Info</h3>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelCls}>Product Name *</label>
              <input
                className={inputCls}
                placeholder="e.g. Aloe Vera Face Wash"
                value={form.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Slug *</label>
              <input
                className={inputCls}
                placeholder="aloe-vera-face-wash"
                value={form.slug}
                onChange={(e) => { slugEdited.current = true; onChange({ slug: e.target.value }); }}
              />
              <p className="font-dm text-[11px] text-(--neutral-400) mt-1">
                Lowercase letters, numbers, hyphens only.
              </p>
            </div>
            <div>
              <label className={labelCls}>Description *</label>
              <textarea
                className={`${inputCls} resize-none h-24`}
                placeholder="Full product description…"
                value={form.description}
                onChange={(e) => onChange({ description: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Short Description</label>
              <textarea
                className={`${inputCls} resize-none h-16`}
                placeholder="One-liner for product cards"
                value={form.shortDescription}
                onChange={(e) => onChange({ shortDescription: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* ── 2. Pricing ── */}
        <section>
          <h3 className={sectionTitleCls}>Pricing</h3>
          <div className="flex flex-col gap-4">

            {/* E1 + E2: Price field with optional savings badge */}
            <div>
              <label className={labelCls}>
                <span className="flex items-center gap-2">
                  Price (KES) *
                  {/* E2: savings badge shown next to price label when toggle is on and % is valid */}
                  {showSavingsBadge && savePercent && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 bg-(--gold-100) text-(--gold-700) text-[11px] font-dm font-medium normal-case tracking-normal">
                      Save {savePercent}%
                    </span>
                  )}
                </span>
              </label>
              <PriceInput
                label=""
                digits={form.priceKes}
                setDigits={(d) => onChange({ priceKes: d })}
                placeholder="0.00"
                required
              />
            </div>

            {/* E2: Compare-at price with strikethrough preview + savings toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`${labelCls} mb-0`}>Compare-at Price (KES)</label>
                {/* E2: "Show % savings" toggle — only visible when a valid compare price exists */}
                {savePercent !== null && (
                  <div className="flex items-center gap-2">
                    <span className="font-dm text-[11px] text-(--neutral-500)">Show % savings</span>
                    <Switch
                      checked={showSavingsBadge}
                      onChange={setShowSavingsBadge}
                    />
                  </div>
                )}
              </div>

              <PriceInput
                label=""
                digits={form.compareAtPriceKes}
                setDigits={(d) => onChange({ compareAtPriceKes: d })}
                placeholder="0.00"
              />

              {/* E2: Strikethrough preview below compare price input */}
              {compareInCents > 0 && (
                <p className="font-dm text-[12px] text-(--neutral-400) mt-1 line-through">
                  KES {formatPrice(form.compareAtPriceKes)}
                </p>
              )}
            </div>

            <div>
              <label className={labelCls}>Variant Label</label>
              <input
                className={inputCls}
                placeholder="e.g. 250ml"
                value={form.variantLabel}
                onChange={(e) => onChange({ variantLabel: e.target.value })}
              />
            </div>

            {/* E3: Category dropdown with inline add */}
            <div>
              <label className={labelCls}>Category *</label>
              <CategoryDropdown
                value={form.categoryId}
                onChange={(id) => onChange({ categoryId: id })}
                categories={categories}
                onCategoryAdded={onCategoryAdded}
              />
            </div>
          </div>
        </section>

        {/* ── 3. Images ── */}
        <section>
          <h3 className={sectionTitleCls}>Images</h3>
          <ImageUploadGrid
            imageKeys={form.imageKeys}
            onChange={(keys) => onChange({ imageKeys: keys })}
          />
        </section>

        {/* ── 4. Inventory ── */}
        <section>
          <h3 className={sectionTitleCls}>Inventory</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Stock Quantity</label>
              <input
                type="number" min={0} className={inputCls}
                value={form.stock}
                onChange={(e) => onChange({ stock: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Switch
                checked={form.isActive}
                onChange={(v) => onChange({ isActive: v })}
              />
              <span className="font-dm text-[13px] text-(--neutral-700)">Active (visible in store)</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Switch
                checked={form.bestSeller}
                onChange={(v) => onChange({ bestSeller: v })}
              />
              <span className="font-dm text-[13px] text-(--neutral-700)">Best Seller badge</span>
            </label>
          </div>
        </section>

        {/* ── 5. SEO (collapsible) ── */}
        <section>
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <h3 className={sectionTitleCls + " mb-0"}>SEO</h3>
              <ChevronDown size={16} className="text-(--neutral-400) group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label className={labelCls}>SEO Title</label>
                <input
                  className={inputCls}
                  placeholder="Fechi Organics – Aloe Vera Face Wash"
                  value={form.seoTitle}
                  onChange={(e) => onChange({ seoTitle: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Meta Description</label>
                <textarea
                  className={`${inputCls} resize-none h-16`}
                  placeholder="A gentle, organic aloe vera face wash…"
                  value={form.metaDescription}
                  onChange={(e) => onChange({ metaDescription: e.target.value })}
                />
              </div>
              <p className="font-dm text-[11px] text-(--neutral-400)">
                Canonical URL: /shop/<strong>{form.slug || "product-slug"}</strong>
              </p>
            </div>
          </details>
        </section>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Bulk action bar (fixed bottom)
// ---------------------------------------------------------------------------
function BulkBar({
  count, onActivate, onDeactivate, onDelete, isPending,
}: {
  count: number;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 md:left-[264px] h-[72px] bg-white border-t border-(--neutral-200) shadow-(--e3) z-30 flex items-center px-6 gap-4"
        >
          <span className="font-dm text-[14px] font-medium text-(--neutral-700) mr-auto">
            {count} selected
          </span>
          <button
            onClick={onActivate}
            disabled={isPending}
            className="h-9 px-4 rounded-[8px] bg-(--green-50) font-dm text-[13px] text-(--success) hover:bg-(--green-800) hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Check size={14} /> Activate
          </button>
          <button
            onClick={onDeactivate}
            disabled={isPending}
            className="h-9 px-4 rounded-[8px] bg-(--neutral-100) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-200) transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <X size={14} /> Deactivate
          </button>
          <button
            onClick={onDelete}
            disabled={isPending}
            className="h-9 px-4 rounded-[8px] bg-(--danger-bg) font-dm text-[13px] text-(--danger) hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
          >
            <Trash2 size={14} /> Delete
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminProductsClient() {
  const qc = useQueryClient();

  // View / filter state
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("admin-products-view") as ViewMode) ?? "list";
    }
    return "list";
  });
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "inactive">("");
  const [sort, setSort] = useState<SortOption>("newest");

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<DrawerFormData>(blankForm());

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Zoho sync state
  const [syncing, setSyncing] = useState(false);

  async function handleZohoSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      // POST /api/admin/zoho/sync — triggers a full product sync with Zoho Inventory
      const res = await fetch("/api/admin/zoho/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Sync failed");
      toast.success("Zoho sync complete.");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zoho sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // ── Data query ──
  const { data, isLoading } = useQuery<{ ok: boolean; data: { products: AdminProduct[] } }>({
    queryKey: ["admin-products"],
    queryFn: () => fetch("/api/admin/products").then((r) => r.json()),
    staleTime: 60_000,
  });

  const products: AdminProduct[] = data?.data?.products ?? [];

  // Derive categories from loaded products (no extra API call unless categories page)
  // E3: allow adding new categories inline — keep a local supplemental list
  const [extraCategories, setExtraCategories] = useState<Category[]>([]);

  const productCategories: Category[] = [
    ...new Map(
      products
        .filter((p) => p.category)
        .map((p) => [p.categoryId, p.category as Category])
    ).values(),
  ];

  // Merge product-derived categories with any added inline, deduplicating by id
  const allCategoryIds = new Set(productCategories.map((c) => c.id));
  const categories: Category[] = [
    ...productCategories,
    ...extraCategories.filter((c) => !allCategoryIds.has(c.id)),
  ];

  function handleCategoryAdded(cat: Category) {
    setExtraCategories((prev) => {
      if (prev.some((c) => c.id === cat.id)) return prev;
      return [...prev, cat];
    });
  }

  // ── Filtered + sorted list ──
  const filtered = products
    .filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.slug.toLowerCase().includes(q) && !(p.category?.name.toLowerCase().includes(q))) return false;
      }
      if (filterCategory && p.categoryId !== filterCategory) return false;
      if (filterStatus === "active" && !p.isActive) return false;
      if (filterStatus === "inactive" && p.isActive) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "price-asc": return a.priceKes - b.priceKes;
        case "price-desc": return b.priceKes - a.priceKes;
        case "name-asc": return a.name.localeCompare(b.name);
        case "stock-asc": return a.stock - b.stock;
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error?.message ?? "Could not create product"); return; }
      toast.success("Product published");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      closeDrawer();
    },
    onError: () => toast.error("Could not create product"),
  });

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const id = (body as { id: string }).id;
      const res = await fetch(`/api/admin/products/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error?.message ?? "Could not update product"); return; }
      toast.success("Product updated");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      closeDrawer();
    },
    onError: () => toast.error("Could not update product"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      toast.success("Product deactivated");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("Could not delete product"),
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: "activate" | "deactivate" | "delete" }) => {
      // Sequential PATCH/DELETE for each — simple, avoids a bulk endpoint
      const promises = ids.map((id) => {
        if (action === "delete") {
          return fetch(`/api/admin/products/${id}`, { method: "DELETE" });
        }
        return fetch(`/api/admin/products/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: action === "activate" }),
        });
      });
      await Promise.all(promises);
    },
    onSuccess: (_, { action, ids }) => {
      const label = action === "delete" ? "deleted" : action === "activate" ? "activated" : "deactivated";
      toast.success(`${ids.length} product${ids.length > 1 ? "s" : ""} ${label}`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setSelected(new Set());
      setBulkDeleteConfirm(false);
    },
    onError: () => toast.error("Bulk action failed"),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── Drawer helpers ──
  const openCreate = () => {
    setEditingProduct(null);
    setForm(blankForm());
    setDrawerOpen(true);
  };

  const openEdit = (product: AdminProduct) => {
    setEditingProduct(product);
    setForm(productToForm(product));
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setEditingProduct(null), 250);
  };

  const handleFormChange = useCallback((patch: Partial<DrawerFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  function buildBody(isActive: boolean) {
    // E1: form.priceKes is a digits-only string already in cents (e.g. "120000" = KES 1,200.00)
    const priceKes = form.priceKes ? parseInt(form.priceKes, 10) : NaN;
    const compareAtPriceKes = form.compareAtPriceKes ? parseInt(form.compareAtPriceKes, 10) : undefined;
    const stock = parseInt(form.stock, 10) || 0;

    if (!form.name.trim()) { toast.error("Product name is required"); return null; }
    if (!form.slug.trim()) { toast.error("Slug is required"); return null; }
    if (!form.categoryId) { toast.error("Category is required"); return null; }
    if (!form.description.trim()) { toast.error("Description is required"); return null; }
    if (isNaN(priceKes) || priceKes <= 0) { toast.error("Enter a valid price"); return null; }

    return {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      shortDescription: form.shortDescription.trim() || undefined,
      categoryId: form.categoryId,
      priceKes,
      compareAtPriceKes: compareAtPriceKes && compareAtPriceKes > 0 ? compareAtPriceKes : undefined,
      variantLabel: form.variantLabel.trim() || undefined,
      stock,
      bestSeller: form.bestSeller,
      isActive,
      imageObjectKeys: form.imageKeys,
    };
  }

  const handleSave = (asActive: boolean) => {
    const body = buildBody(asActive);
    if (!body) return;
    if (editingProduct) {
      updateMutation.mutate({ ...body, id: editingProduct.id });
    } else {
      createMutation.mutate(body);
    }
  };

  const handleDuplicate = (product: AdminProduct) => {
    setEditingProduct(null);
    setForm({
      ...productToForm(product),
      name: `${product.name} (copy)`,
      slug: `${product.slug}-copy`,
      isActive: false,
      imageKeys: [], // reset images for duplicate
    });
    setDrawerOpen(true);
    toast.info("Duplicating product — update name and slug before saving");
  };

  // ── View toggle with localStorage ──
  function setViewMode(v: ViewMode) {
    setView(v);
    localStorage.setItem("admin-products-view", v);
  }

  // ── DataTable columns (list view) ──
  const tableColumns = [
    {
      key: "name",
      label: "Product",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as AdminProduct;
        const src = getPrimaryImage(p.images);
        return (
          <div className="flex items-center gap-3 py-1">
            <div className="w-10 h-10 rounded-[8px] bg-(--neutral-100) overflow-hidden shrink-0">
              {src
                ? <Image src={src} alt={p.name} width={40} height={40} className="object-cover w-full h-full" />
                : <div className="w-full h-full flex items-center justify-center"><Tag size={16} className="text-(--neutral-300)" /></div>
              }
            </div>
            <div>
              <p className="font-dm text-[14px] font-medium text-(--neutral-900) leading-snug">{p.name}</p>
              {p.variantLabel && <p className="font-dm text-[12px] text-(--neutral-400)">{p.variantLabel}</p>}
            </div>
          </div>
        );
      },
    },
    {
      key: "category",
      label: "Category",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as AdminProduct;
        return (
          <span className="inline-block rounded-full px-2.5 py-0.5 font-dm text-[12px] font-medium bg-(--green-50) text-(--success)">
            {p.category?.name ?? "—"}
          </span>
        );
      },
    },
    {
      key: "priceKes",
      label: "Price",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as AdminProduct;
        return (
          <div>
            <p className="font-dm text-[14px] font-semibold text-(--neutral-900)">{formatKes(p.priceKes)}</p>
            {p.compareAtPriceKes && (
              <p className="font-dm text-[12px] text-(--neutral-400) line-through">{formatKes(p.compareAtPriceKes)}</p>
            )}
          </div>
        );
      },
    },
    {
      key: "stock",
      label: "Stock",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as AdminProduct;
        const cfg =
          p.stock === 0
            ? "bg-(--danger-bg) text-(--danger)"
            : p.stock < 10
            ? "bg-(--gold-100) text-(--gold-700)"
            : "bg-(--green-50) text-(--success)";
        return (
          <span className={`inline-block rounded-full px-2.5 py-0.5 font-dm text-[12px] font-semibold ${cfg}`}>
            {p.stock === 0 ? "Out of stock" : p.stock}
          </span>
        );
      },
    },
    {
      key: "isActive",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as AdminProduct;
        return <StatusPill status={p.isActive ? "active" : "draft"} />;
      },
    },
    {
      key: "ratingAvg",
      label: "Rating",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as AdminProduct;
        if (!p.ratingCount) return <span className="font-dm text-[13px] text-(--neutral-300)">—</span>;
        return (
          <span className="font-dm text-[13px] text-(--gold-700) flex items-center gap-1">
            <Star size={12} fill="currentColor" />
            {p.ratingAvg.toFixed(1)}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as AdminProduct;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <CardMenu
              product={p}
              onEdit={() => openEdit(p)}
              onDuplicate={() => handleDuplicate(p)}
              onDelete={() => setDeleteTarget(p.id)}
            />
          </div>
        );
      },
    },
  ];

  const addButton = (
    <div className="flex items-center gap-2">
      {/* Sync with Zoho — POST /api/admin/zoho/sync */}
      <button
        type="button"
        onClick={handleZohoSync}
        disabled={syncing}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : "Sync with Zoho"}
      </button>
      <button
        onClick={openCreate}
        className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
      >
        <Plus size={16} />
        Add Product
      </button>
    </div>
  );

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "price-asc", label: "Price: Low → High" },
    { value: "price-desc", label: "Price: High → Low" },
    { value: "name-asc", label: "Name A–Z" },
    { value: "stock-asc", label: "Stock: Low → High" },
  ];

  return (
    <div className="min-h-screen pb-24">
      <ScreenLoader open={isPending || deleteMutation.isPending} message={deleteMutation.isPending ? "Deleting…" : "Saving…"} />
      <PageHeader title="Products" description="Manage your product catalog" action={addButton} />

      {/* ── Filter toolbar ── */}
      <div className="px-6 pb-5 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative w-[280px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full h-9 pl-9 pr-3 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-900) bg-white focus:outline-none focus:border-(--green-800) placeholder:text-(--neutral-400) transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) hover:text-(--neutral-700)">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Category filter */}
        <div className="relative">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-9 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) bg-white focus:outline-none focus:border-(--green-800) appearance-none cursor-pointer"
          >
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | "active" | "inactive")}
            className="h-9 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) bg-white focus:outline-none focus:border-(--green-800) appearance-none cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="h-9 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) bg-white focus:outline-none focus:border-(--green-800) appearance-none cursor-pointer"
          >
            {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
        </div>

        {/* Count label */}
        {!isLoading && (
          <span className="font-dm text-[13px] text-(--neutral-400) ml-1">
            {filtered.length} product{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 bg-(--neutral-100) rounded-[8px] p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={`h-8 w-9 flex items-center justify-center rounded-[6px] transition-colors ${view === "grid" ? "bg-white shadow-(--e1) text-(--neutral-900)" : "text-(--neutral-400) hover:text-(--neutral-700)"}`}
            aria-label="Grid view"
          >
            <Grid size={15} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`h-8 w-9 flex items-center justify-center rounded-[6px] transition-colors ${view === "list" ? "bg-white shadow-(--e1) text-(--neutral-900)" : "text-(--neutral-400) hover:text-(--neutral-700)"}`}
            aria-label="List view"
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="px-6">
        {view === "grid" ? (
          // ── Grid view ──
          isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-white rounded-[12px] border border-(--neutral-200) overflow-hidden">
                  <div className="aspect-square bg-(--neutral-100) animate-pulse" />
                  <div className="p-3 flex flex-col gap-2">
                    <div className="h-3.5 bg-(--neutral-100) rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-(--neutral-100) rounded animate-pulse w-1/2" />
                    <div className="h-4 bg-(--neutral-100) rounded animate-pulse w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-(--neutral-200) shadow-(--e1) flex flex-col items-center justify-center py-24 text-center">
              <Tag size={40} className="text-(--neutral-300) mb-4" />
              <p className="font-syne text-[18px] font-semibold text-(--neutral-900) mb-1">No products found</p>
              <p className="font-dm text-[14px] text-(--neutral-500)">Try adjusting your filters or add a new product.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((p) => (
                <ProductGridCard
                  key={p.id}
                  product={p}
                  onEdit={() => openEdit(p)}
                  onDuplicate={() => handleDuplicate(p)}
                  onDelete={() => setDeleteTarget(p.id)}
                />
              ))}
            </div>
          )
        ) : (
          // ── List view ──
          <DataTable
            columns={tableColumns}
            data={filtered as unknown as Record<string, unknown>[]}
            loading={isLoading}
            onRowClick={(row) => openEdit(row as unknown as AdminProduct)}
            emptyTitle="No products found"
            emptyDescription="Try adjusting your filters or add a new product."
            pageSize={25}
          />
        )}
      </div>

      {/* ── Product Drawer ── */}
      <ProductDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        editing={editingProduct}
        form={form}
        onChange={handleFormChange}
        onSaveActive={() => handleSave(true)}
        onSaveDraft={() => handleSave(false)}
        isPending={isPending}
        categories={categories}
        onCategoryAdded={handleCategoryAdded}
      />

      {/* ── Single delete confirm ── */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="Deactivate product?"
        description="The product will be hidden from the store. You can reactivate it any time."
        confirmLabel="Deactivate"
        danger
        loading={deleteMutation.isPending}
      />

      {/* ── Bulk delete confirm ── */}
      <ConfirmModal
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={() => bulkMutation.mutate({ ids: Array.from(selected), action: "delete" })}
        title={`Deactivate ${selected.size} products?`}
        description="All selected products will be hidden from the store."
        confirmLabel="Deactivate all"
        danger
        loading={bulkMutation.isPending}
      />

      {/* ── Bulk action bar ── */}
      <BulkBar
        count={selected.size}
        onActivate={() => bulkMutation.mutate({ ids: Array.from(selected), action: "activate" })}
        onDeactivate={() => bulkMutation.mutate({ ids: Array.from(selected), action: "deactivate" })}
        onDelete={() => setBulkDeleteConfirm(true)}
        isPending={bulkMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// __TEST__ — self-check assertions (comment-guarded, never runs in prod)
// Uncomment and run in a Node.js REPL to verify formatPrice logic:
//
// console.assert(formatPrice("120000") === "1,200.00", "120000 → 1,200.00")
// console.assert(formatPrice("100")    === "1.00",     "100 → 1.00")
// console.assert(formatPrice("1")      === "0.01",     "1 → 0.01")
// console.assert(formatPrice("")       === "",          "empty → empty")
// ---------------------------------------------------------------------------
