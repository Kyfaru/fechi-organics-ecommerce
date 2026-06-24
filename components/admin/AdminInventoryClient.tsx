"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Warehouse, Package, AlertTriangle, XCircle, Search, ChevronDown, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatCard } from "@/components/admin/ui/StatCard";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";

// ── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  stock: number;
  imageKey: string | null;
  status: "in_stock" | "low_stock" | "out_of_stock";
}

interface InventoryStats {
  totalSKUs: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

interface AdjustState {
  open: boolean;
  product: InventoryItem | null;
}

type AdjustType = "ADD" | "REMOVE" | "SET";

// ── Helper ───────────────────────────────────────────────────────────────────

function computeAfter(current: number, type: AdjustType, qty: number): number {
  if (type === "ADD") return current + qty;
  if (type === "REMOVE") return Math.max(0, current - qty);
  return qty;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AdminInventoryClient() {
  const qc = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Zoho sync state
  const [syncing, setSyncing] = useState(false);

  async function handleZohoSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      // POST /api/admin/zoho/sync — syncs inventory levels with Zoho Inventory
      const res = await fetch("/api/admin/zoho/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Sync failed");
      toast.success("Zoho sync complete.");
      qc.invalidateQueries({ queryKey: ["admin-inventory"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zoho sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // Adjust drawer state
  const [adjustDrawer, setAdjustDrawer] = useState<AdjustState>({ open: false, product: null });
  const [adjustType, setAdjustType] = useState<AdjustType>("ADD");
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState("Received delivery");
  const [adjustNotes, setAdjustNotes] = useState("");

  // ── Data fetch ────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () => fetch("/api/admin/inventory").then((r) => r.json()),
  });

  const items: InventoryItem[] = data?.data?.items ?? [];
  const stats: InventoryStats = data?.data?.stats ?? { totalSKUs: 0, inStock: 0, lowStock: 0, outOfStock: 0 };

  // Unique categories for filter dropdown
  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.categoryName))).sort(),
    [items]
  );

  // Apply filters
  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "all" || item.categoryName === categoryFilter;
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      return matchSearch && matchCategory && matchStatus;
    });
  }, [items, search, categoryFilter, statusFilter]);

  // ── Adjust mutation ───────────────────────────────────────────────────────
  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjustDrawer.product) return;
      const res = await fetch("/api/admin/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: adjustDrawer.product.id,
          type: adjustType,
          quantity: adjustQty,
          reason: adjustReason,
          notes: adjustNotes || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Adjustment failed");
      return json.data;
    },
    onSuccess: (data) => {
      toast.success(`Stock updated: ${data.name} is now ${data.newStock} units`);
      qc.invalidateQueries({ queryKey: ["admin-inventory"] });
      closeDrawer();
    },
    onError: (e: Error) => {
      console.error("[inventory/adjust]", e);
      toast.error(e.message);
    },
  });

  function openAdjust(product: InventoryItem) {
    setAdjustDrawer({ open: true, product });
    setAdjustType("ADD");
    setAdjustQty(0);
    setAdjustReason("Received delivery");
    setAdjustNotes("");
  }

  function closeDrawer() {
    setAdjustDrawer({ open: false, product: null });
  }

  const previewAfter = adjustDrawer.product
    ? computeAfter(adjustDrawer.product.stock, adjustType, adjustQty)
    : 0;

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      key: "name",
      label: "Product",
      render: (_: unknown, row: Record<string, unknown>) => {
        const item = row as unknown as InventoryItem;
        const borderColor =
          item.status === "out_of_stock"
            ? "var(--danger)"
            : item.status === "low_stock"
            ? "var(--gold-500)"
            : "transparent";
        return (
          <div className="flex items-center gap-3" style={{ paddingLeft: 8, borderLeft: `3px solid ${borderColor}` }}>
            {/* Thumbnail */}
            <div className="w-8 h-8 rounded-[6px] bg-(--neutral-100) overflow-hidden shrink-0 flex items-center justify-center">
              {item.imageKey ? (
                // TODO: replace with actual CDN URL for objectKey
                <img
                  src={`/api/image/${item.imageKey}`}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <Package size={14} className="text-(--neutral-400)" />
              )}
            </div>
            <div>
              <div className="font-dm text-[14px] font-medium text-(--neutral-900)">{item.name}</div>
              <div className="font-dm text-[12px] text-(--neutral-400)">SKU: {item.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "categoryName",
      label: "Category",
      sortable: true,
      render: (v: unknown) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">{String(v)}</span>
      ),
    },
    {
      key: "stock",
      label: "Stock",
      sortable: true,
      render: (v: unknown, row: Record<string, unknown>) => {
        const item = row as unknown as InventoryItem;
        const color =
          item.status === "out_of_stock"
            ? "text-(--danger)"
            : item.status === "low_stock"
            ? "text-(--gold-700)"
            : "text-(--neutral-900)";
        return (
          <span className={`font-dm text-[14px] font-semibold ${color}`}>
            {String(v)} units
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (v: unknown) => <StatusPill status={String(v)} />,
    },
    {
      key: "id",
      label: "Actions",
      render: (_: unknown, row: Record<string, unknown>) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openAdjust(row as unknown as InventoryItem);
          }}
          className="h-8 px-3 rounded-[6px] font-dm text-[13px] font-medium bg-(--neutral-100) hover:bg-(--neutral-200) text-(--neutral-700) transition-colors"
        >
          Adjust
        </button>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        title="Inventory"
        description="Track and manage product stock levels"
      />

      <div className="px-6 pb-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard eyebrow="Total SKUs" value={String(stats.totalSKUs)} icon={Warehouse} />
          <StatCard
            eyebrow="In Stock"
            value={String(stats.inStock)}
            icon={Package}
            trend={{ value: "Healthy", positive: true }}
          />
          <StatCard
            eyebrow="Low Stock"
            value={String(stats.lowStock)}
            icon={AlertTriangle}
          />
          <StatCard
            eyebrow="Out of Stock"
            value={String(stats.outOfStock)}
            icon={XCircle}
          />
        </div>

        {/* Filter toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400)" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full h-10 pl-9 pr-4 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent"
            />
          </div>

          {/* Category */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-700) focus:outline-none focus:ring-2 focus:ring-(--green-500) appearance-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-700) focus:outline-none focus:ring-2 focus:ring-(--green-500) appearance-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
          </div>

          {/* Zoho sync button — POST /api/admin/zoho/sync */}
          <button
            type="button"
            onClick={handleZohoSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50 ml-auto"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync with Zoho"}
          </button>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No products found"
          emptyDescription="Try adjusting your search or filters."
          pageSize={25}
        />
      </div>

      {/* Quick Adjust Drawer */}
      <Drawer
        open={adjustDrawer.open}
        onClose={closeDrawer}
        title="Adjust Stock"
        width={480}
        footer={
          <>
            <button
              onClick={closeDrawer}
              className="h-10 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => adjustMutation.mutate()}
              disabled={adjustMutation.isPending || adjustQty < 0}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50 ml-auto"
            >
              {adjustMutation.isPending ? "Saving..." : "Save Adjustment"}
            </button>
          </>
        }
      >
        {adjustDrawer.product && (
          <div className="space-y-5">
            {/* Product name */}
            <div>
              <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">Product</label>
              <input
                value={adjustDrawer.product.name}
                disabled
                className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-(--neutral-50) font-dm text-[14px] text-(--neutral-500) cursor-not-allowed"
              />
            </div>

            {/* Adjustment type */}
            <div>
              <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-2">Adjustment Type</label>
              <div className="flex gap-2">
                {(["ADD", "REMOVE", "SET"] as AdjustType[]).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="adjustType"
                      value={t}
                      checked={adjustType === t}
                      onChange={() => setAdjustType(t)}
                      className="accent-(--green-800)"
                    />
                    <span className="font-dm text-[14px] text-(--neutral-700) capitalize">
                      {t === "ADD" ? "Add" : t === "REMOVE" ? "Remove" : "Set Exact"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">Quantity</label>
              <input
                type="number"
                min={0}
                value={adjustQty}
                onChange={(e) => setAdjustQty(Math.max(0, Number(e.target.value)))}
                className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) focus:outline-none focus:ring-2 focus:ring-(--green-500)"
              />
              {/* Before → After preview */}
              {adjustQty > 0 && (
                <div className="mt-2 flex items-center gap-2 text-[13px] font-dm">
                  <span className="text-(--neutral-500)">Before:</span>
                  <span className="font-semibold text-(--neutral-900)">{adjustDrawer.product.stock}</span>
                  <span className="text-(--neutral-400)">→</span>
                  <span className="text-(--neutral-500)">After:</span>
                  <span
                    className={`font-semibold ${
                      previewAfter === 0
                        ? "text-(--danger)"
                        : previewAfter < 10
                        ? "text-(--gold-700)"
                        : "text-(--success)"
                    }`}
                  >
                    {previewAfter}
                  </span>
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">Reason</label>
              <div className="relative">
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full h-10 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) focus:outline-none focus:ring-2 focus:ring-(--green-500) appearance-none"
                >
                  <option>Received delivery</option>
                  <option>Damaged/Lost</option>
                  <option>Stock audit</option>
                  <option>Correction</option>
                  <option>Other</option>
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">
                Notes <span className="text-(--neutral-400) font-normal">(optional)</span>
              </label>
              <textarea
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                rows={3}
                placeholder="Additional context..."
                className="w-full px-3 py-2 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) resize-none focus:outline-none focus:ring-2 focus:ring-(--green-500)"
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
