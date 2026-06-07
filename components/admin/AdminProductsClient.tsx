"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  priceKes: number;
  compareAtPriceKes: number | null;
  variantLabel: string | null;
  bestSeller: boolean;
  isActive: boolean;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  images: { objectKey: string }[];
};

type Category = { id: string; name: string; slug: string };

type FormData = {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  categoryId: string;
  priceKes: string;
  compareAtPriceKes: string;
  variantLabel: string;
  stock: string;
  bestSeller: boolean;
  isActive: boolean;
  imageObjectKey: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(kes: number) {
  return `KES ${kes.toLocaleString("en-KE")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Returns an absolute image URL from an objectKey, or null if not applicable */
function resolveImageSrc(objectKey?: string): string | null {
  if (!objectKey) return null;
  // Dev/test: if the key is already a full URL, use it directly
  if (objectKey.startsWith("http://") || objectKey.startsWith("https://")) {
    return objectKey;
  }
  // TODO: replace with your R2 public URL base, e.g.:
  // return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${objectKey}`;
  return null;
}

/** Stock badge — red 0, yellow ≤5, green >5 */
function StockBadge({ stock }: { stock: number }) {
  const color =
    stock === 0
      ? { bg: "#fee2e2", text: "#991b1b" }
      : stock <= 5
      ? { bg: "#fef9c3", text: "#92400e" }
      : { bg: "#dcfce7", text: "#166534" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-[12px] font-semibold"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {stock === 0 ? "Out" : stock}
    </span>
  );
}

/** Pill toggle button — green when on, grey when off */
function PillToggle({
  active,
  onClick,
  disabled,
  onLabel,
  offLabel,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 py-1 font-body text-[12px] font-semibold transition-all disabled:opacity-60"
      style={
        active
          ? { backgroundColor: "#dcfce7", color: "#166534" }
          : { backgroundColor: "#f3f4f6", color: "#6b7280" }
      }
    >
      {active ? onLabel : offLabel}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: "#f0f4ef" }}
      >
        <Icon icon="mdi:package-variant-closed" width={32} style={{ color: "#c0cab8" }} />
      </div>
      <p className="font-heading text-[#1a1c1c] text-[17px] font-semibold mb-1">No products yet</p>
      <p className="font-body text-[#40493c] text-[14px]">
        Add your first product to get started.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table row skeleton
// ---------------------------------------------------------------------------
function TableRowSkeleton() {
  return (
    <tr className="border-b border-[#f0f0f0]">
      {[56, 200, 120, 100, 60, 70, 70, 80].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 rounded" style={{ width: w }} />
        </td>
      ))}
      <td className="px-4 py-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Drawer form (slide from right)
// ---------------------------------------------------------------------------
type DrawerProps = {
  open: boolean;
  onClose: () => void;
  editing: AdminProduct | null;
  form: FormData;
  onFormChange: (key: keyof FormData, value: string | boolean) => void;
  onSubmit: () => void;
  isPending: boolean;
  categories: Category[];
};

function ProductDrawer({
  open,
  onClose,
  editing,
  form,
  onFormChange,
  onSubmit,
  isPending,
  categories,
}: DrawerProps) {
  const isNew = editing === null;

  const inputClass =
    "w-full font-body text-[14px] text-[#1a1c1c] rounded-[8px] border border-[#c0cab8] bg-white px-3 py-2.5 focus:outline-none focus:border-[#27731e] transition-colors placeholder:text-[#a1a1a1]";
  const labelClass = "block font-body text-[#40493c] text-[12px] font-semibold uppercase tracking-[0.6px] mb-1.5";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="products-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            key="products-drawer-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
            className="fixed right-0 top-0 h-full z-50 flex flex-col bg-white shadow-2xl"
            style={{ width: "min(480px, 100vw)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#e2e2e2]">
              <h2 className="font-heading font-semibold text-[#1a1c1c] text-[18px]">
                {isNew ? "Add Product" : "Edit Product"}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                style={{ backgroundColor: "#f3f4f6", color: "#40493c" }}
                aria-label="Close drawer"
              >
                <Icon icon="mdi:close" width={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">

              {/* Name */}
              <div>
                <label className={labelClass}>Product Name *</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Aloe Vera Face Wash"
                  value={form.name}
                  onChange={(e) => onFormChange("name", e.target.value)}
                />
              </div>

              {/* Slug */}
              <div>
                <label className={labelClass}>Slug *</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. aloe-vera-face-wash"
                  value={form.slug}
                  onChange={(e) => onFormChange("slug", e.target.value)}
                />
                <p className="font-body text-[11px] mt-1" style={{ color: "#a1a1a1" }}>
                  Lowercase letters, numbers, and hyphens only.
                </p>
              </div>

              {/* Category */}
              <div>
                <label className={labelClass}>Category *</label>
                <select
                  className={inputClass}
                  value={form.categoryId}
                  onChange={(e) => onFormChange("categoryId", e.target.value)}
                >
                  <option value="">Select a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Price (KES) *</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    placeholder="1200"
                    value={form.priceKes}
                    onChange={(e) => onFormChange("priceKes", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Compare At (KES)</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    placeholder="1500"
                    value={form.compareAtPriceKes}
                    onChange={(e) => onFormChange("compareAtPriceKes", e.target.value)}
                  />
                </div>
              </div>

              {/* Stock + Variant */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Stock</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    placeholder="0"
                    value={form.stock}
                    onChange={(e) => onFormChange("stock", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Variant Label</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g. 250ml"
                    value={form.variantLabel}
                    onChange={(e) => onFormChange("variantLabel", e.target.value)}
                  />
                </div>
              </div>

              {/* Short description */}
              <div>
                <label className={labelClass}>Short Description</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="One-liner for product cards"
                  value={form.shortDescription}
                  onChange={(e) => onFormChange("shortDescription", e.target.value)}
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelClass}>Description *</label>
                <textarea
                  rows={5}
                  className={`${inputClass} resize-none`}
                  placeholder="Full product description…"
                  value={form.description}
                  onChange={(e) => onFormChange("description", e.target.value)}
                />
              </div>

              {/* Image Object Key */}
              {isNew && (
                <div>
                  <label className={labelClass}>Image Object Key</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="https://… or r2-key/path"
                    value={form.imageObjectKey}
                    onChange={(e) => onFormChange("imageObjectKey", e.target.value)}
                  />
                  <p className="font-body text-[11px] mt-1" style={{ color: "#a1a1a1" }}>
                    Primary image key. Full URLs work for dev/test.
                  </p>
                </div>
              )}

              {/* Toggles row */}
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.isActive}
                    onClick={() => onFormChange("isActive", !form.isActive)}
                    className="relative w-10 h-6 rounded-full transition-colors focus:outline-none"
                    style={{ backgroundColor: form.isActive ? "#27731e" : "#d1d5db" }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                      style={{ transform: form.isActive ? "translateX(16px)" : "translateX(0)" }}
                    />
                  </button>
                  <span className="font-body text-[14px] text-[#40493c]">Active</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.bestSeller}
                    onClick={() => onFormChange("bestSeller", !form.bestSeller)}
                    className="relative w-10 h-6 rounded-full transition-colors focus:outline-none"
                    style={{ backgroundColor: form.bestSeller ? "#fec700" : "#d1d5db" }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                      style={{ transform: form.bestSeller ? "translateX(16px)" : "translateX(0)" }}
                    />
                  </button>
                  <span className="font-body text-[14px] text-[#40493c]">Best Seller</span>
                </label>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-[#e2e2e2] flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isPending}
                className="px-5 py-2.5 rounded-[8px] font-body text-[14px] font-semibold transition-colors border border-[#c0cab8] text-[#40493c] hover:border-[#27731e] hover:text-[#27731e] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={isPending}
                className="px-6 py-2.5 rounded-[8px] font-body text-[14px] font-semibold text-white transition-all flex items-center gap-2 disabled:opacity-70"
                style={{ backgroundColor: isPending ? "#40793a" : "#27731e" }}
              >
                {isPending && <Spinner size={16} invert />}
                {isNew ? "Create Product" : "Save Changes"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Blank form factory
// ---------------------------------------------------------------------------
function blankForm(): FormData {
  return {
    name: "",
    slug: "",
    description: "",
    shortDescription: "",
    categoryId: "",
    priceKes: "",
    compareAtPriceKes: "",
    variantLabel: "",
    stock: "0",
    bestSeller: false,
    isActive: true,
    imageObjectKey: "",
  };
}

function productToForm(p: AdminProduct): FormData {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description,
    shortDescription: p.shortDescription ?? "",
    categoryId: p.categoryId,
    priceKes: String(p.priceKes),
    compareAtPriceKes: p.compareAtPriceKes != null ? String(p.compareAtPriceKes) : "",
    variantLabel: p.variantLabel ?? "",
    stock: String(p.stock),
    bestSeller: p.bestSeller,
    isActive: p.isActive,
    imageObjectKey: "",
  };
}

// ---------------------------------------------------------------------------
// Sync from Zoho button — calls POST /api/zoho/sync
// ---------------------------------------------------------------------------
function SyncZohoButton() {
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/zoho/sync", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Sync failed");
      return json.data as { upserted: number; deactivated: number };
    },
    onSuccess: (data) => {
      toast.success(
        `Synced: ${data.upserted} updated, ${data.deactivated} deactivated`
      );
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Zoho sync failed");
    },
  });

  return (
    <button
      onClick={() => sync.mutate()}
      disabled={sync.isPending}
      className="inline-flex items-center gap-2 rounded-[8px] px-5 py-2.5 font-body text-[14px] font-semibold border transition-all hover:bg-[#f0faf0] disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ borderColor: "#27731e", color: "#27731e" }}
    >
      {sync.isPending ? (
        <Spinner size={16} />
      ) : (
        <Icon icon="mdi:cloud-sync-outline" width={18} />
      )}
      Sync from Zoho
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminProductsClient() {
  const qc = useQueryClient();

  // UI state
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<FormData>(blankForm());

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const { data, isLoading } = useQuery<{ ok: boolean; data: { products: AdminProduct[] } }>({
    queryKey: ["admin-products"],
    queryFn: () => fetch("/api/admin/products").then((r) => r.json()),
  });

  const products = data?.data?.products ?? [];

  // Derive unique categories from loaded products (avoids separate API call)
  const categories: Category[] = [
    ...new Map(products.map((p) => [p.categoryId, p.category])).values(),
  ];

  // Filtered list based on search
  const filtered = search.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.slug.toLowerCase().includes(search.toLowerCase()) ||
          p.category.name.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const createProduct = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error?.message ?? "Could not create product");
        return;
      }
      toast.success("Product created");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      closeDrawer();
    },
    onError: () => toast.error("Could not create product"),
  });

  const updateProduct = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error?.message ?? "Could not update product");
        return;
      }
      toast.success("Product updated");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      closeDrawer();
    },
    onError: () => toast.error("Could not update product"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      return res.json();
    },
    onSuccess: (res, vars) => {
      if (!res.ok) { toast.error("Could not update product"); return; }
      toast.success(vars.isActive ? "Product activated" : "Product deactivated");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: () => toast.error("Could not update product"),
  });

  const toggleBestSeller = useMutation({
    mutationFn: async ({ id, bestSeller }: { id: string; bestSeller: boolean }) => {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, bestSeller }),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) { toast.error("Could not update product"); return; }
      toast.success("Best seller status updated");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: () => toast.error("Could not update product"),
  });

  // ---------------------------------------------------------------------------
  // Drawer helpers
  // ---------------------------------------------------------------------------
  const openCreateDrawer = () => {
    setEditingProduct(null);
    setForm(blankForm());
    setDrawerOpen(true);
  };

  const openEditDrawer = (product: AdminProduct) => {
    setEditingProduct(product);
    setForm(productToForm(product));
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    // Delay clearing editing state so exit animation completes cleanly
    setTimeout(() => setEditingProduct(null), 300);
  };

  const handleFormChange = useCallback((key: keyof FormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Submit — build the request body, coercing number fields
  const handleSubmit = () => {
    const priceKes = parseInt(form.priceKes, 10);
    const compareAtPriceKes = form.compareAtPriceKes ? parseInt(form.compareAtPriceKes, 10) : undefined;
    const stock = parseInt(form.stock, 10);

    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    if (!form.slug.trim()) { toast.error("Slug is required"); return; }
    if (!form.categoryId) { toast.error("Category is required"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    if (isNaN(priceKes) || priceKes <= 0) { toast.error("Enter a valid price"); return; }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      shortDescription: form.shortDescription.trim() || undefined,
      categoryId: form.categoryId,
      priceKes,
      ...(compareAtPriceKes ? { compareAtPriceKes } : {}),
      variantLabel: form.variantLabel.trim() || undefined,
      stock: isNaN(stock) ? 0 : stock,
      bestSeller: form.bestSeller,
      isActive: form.isActive,
    };

    if (editingProduct) {
      // PATCH — include only changed fields + id
      updateProduct.mutate({ ...body, id: editingProduct.id });
    } else {
      // POST — include optional imageObjectKey
      if (form.imageObjectKey.trim()) {
        body.imageObjectKey = form.imageObjectKey.trim();
      }
      createProduct.mutate(body);
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="px-6 py-5 border-b flex items-center justify-between bg-white"
        style={{ borderColor: "#e2e2e2" }}
      >
        <div>
          <h1 className="font-heading font-semibold text-[#1a1c1c] text-[24px] leading-tight">
            Products
          </h1>
          <p className="font-body text-[#40493c] text-[13px] mt-0.5">
            {isLoading ? "Loading…" : `${products.length} product${products.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SyncZohoButton />
          <button
            onClick={openCreateDrawer}
            className="inline-flex items-center gap-2 rounded-[8px] px-5 py-2.5 font-body text-[14px] font-semibold text-white transition-all hover:brightness-110 active:brightness-95"
            style={{ backgroundColor: "#27731e" }}
          >
            <Icon icon="mdi:plus" width={18} />
            Add Product
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Body                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6">

        {/* Search */}
        <div className="mb-5 relative max-w-[400px]">
          <Icon
            icon="mdi:magnify"
            width={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#a1a1a1" }}
          />
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-[8px] border font-body text-[14px] text-[#1a1c1c] bg-white focus:outline-none transition-colors placeholder:text-[#a1a1a1]"
            style={{ borderColor: search ? "#27731e" : "#c0cab8" }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              aria-label="Clear search"
            >
              <Icon icon="mdi:close-circle" width={16} style={{ color: "#a1a1a1" }} />
            </button>
          )}
        </div>

        {/* Table card */}
        <div
          className="bg-white rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr style={{ borderBottom: "2px solid #f0f0f0" }}>
                  {["Image", "Name", "Category", "Price", "Stock", "Best Seller", "Status", "Added", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 font-body text-[11px] font-semibold uppercase tracking-[0.6px] whitespace-nowrap"
                      style={{ color: "#a1a1a1" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  // Loading skeletons
                  Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState />
                    </td>
                  </tr>
                ) : (
                  filtered.map((product) => {
                    const imgSrc = resolveImageSrc(product.images[0]?.objectKey);
                    const isPendingToggle =
                      toggleActive.isPending || toggleBestSeller.isPending;

                    return (
                      <motion.tr
                        key={product.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b transition-colors hover:bg-[#fafafa]"
                        style={{ borderColor: "#f0f0f0" }}
                      >
                        {/* Thumbnail */}
                        <td className="px-4 py-3">
                          <div
                            className="w-14 h-14 rounded-[8px] overflow-hidden flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: "#f6f6f6" }}
                          >
                            {imgSrc ? (
                              <Image
                                src={imgSrc}
                                alt={product.name}
                                width={56}
                                height={56}
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <Icon
                                icon="mdi:image-outline"
                                width={24}
                                style={{ color: "#c0cab8" }}
                              />
                            )}
                          </div>
                        </td>

                        {/* Name + slug */}
                        <td className="px-4 py-3 min-w-[180px]">
                          <p className="font-body font-semibold text-[#1a1c1c] text-[14px] leading-snug">
                            {product.name}
                          </p>
                          {product.variantLabel && (
                            <p className="font-body text-[11px] mt-0.5" style={{ color: "#a1a1a1" }}>
                              {product.variantLabel}
                            </p>
                          )}
                          <a
                            href={`/shop/${product.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-body text-[11px] hover:underline mt-0.5 inline-block"
                            style={{ color: "#27731e" }}
                          >
                            /{product.slug}
                          </a>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3">
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 font-body text-[12px] font-medium"
                            style={{ backgroundColor: "#e8fce3", color: "#27731e" }}
                          >
                            {product.category.name}
                          </span>
                        </td>

                        {/* Price */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-body font-semibold text-[#1a1c1c] text-[14px]">
                            {formatPrice(product.priceKes)}
                          </p>
                          {product.compareAtPriceKes && (
                            <p
                              className="font-body text-[12px] line-through"
                              style={{ color: "#a1a1a1" }}
                            >
                              {formatPrice(product.compareAtPriceKes)}
                            </p>
                          )}
                        </td>

                        {/* Stock */}
                        <td className="px-4 py-3">
                          <StockBadge stock={product.stock} />
                        </td>

                        {/* Best seller toggle */}
                        <td className="px-4 py-3">
                          <PillToggle
                            active={product.bestSeller}
                            onLabel="Yes"
                            offLabel="No"
                            disabled={isPendingToggle}
                            onClick={() =>
                              toggleBestSeller.mutate({
                                id: product.id,
                                bestSeller: !product.bestSeller,
                              })
                            }
                          />
                        </td>

                        {/* Active toggle */}
                        <td className="px-4 py-3">
                          <PillToggle
                            active={product.isActive}
                            onLabel="Active"
                            offLabel="Inactive"
                            disabled={isPendingToggle}
                            onClick={() =>
                              toggleActive.mutate({
                                id: product.id,
                                isActive: !product.isActive,
                              })
                            }
                          />
                        </td>

                        {/* Created */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-body text-[12px]" style={{ color: "#a1a1a1" }}>
                            {formatDate(product.createdAt)}
                          </span>
                        </td>

                        {/* Edit action */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openEditDrawer(product)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#e8fce3]"
                            style={{ color: "#27731e" }}
                            aria-label={`Edit ${product.name}`}
                          >
                            <Icon icon="mdi:pencil-outline" width={16} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Search result count */}
          {search && !isLoading && filtered.length > 0 && (
            <div
              className="px-6 py-3 border-t font-body text-[13px]"
              style={{ borderColor: "#f0f0f0", color: "#a1a1a1" }}
            >
              Showing {filtered.length} of {products.length} products
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Slide-over drawer                                                   */}
      {/* ------------------------------------------------------------------ */}
      <ProductDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        editing={editingProduct}
        form={form}
        onFormChange={handleFormChange}
        onSubmit={handleSubmit}
        isPending={isPending}
        categories={categories}
      />
    </div>
  );
}
