"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Trash2, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import Switch from "@/components/ui/Switch";
import { Can } from "@/components/admin/Can";
import { useAdminMe } from "@/hooks/use-can";
import { usePersistedFilter } from "@/hooks/use-persisted-filters";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Types — mirrors the `zohoStagedItem` Prisma model (see API contract in
// app/api/admin/zoho/staged-items/**). This client only reads/writes the
// fields the review UI needs.
// ---------------------------------------------------------------------------
export type StagedStatus = "PENDING" | "EXCLUDED";

interface ZohoStagedItem {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  productType: string | null;
  zohoStatus: string | null;
  unit: string | null;
  brand: string | null;
  rateKes: number | null;
  purchaseRateKes: number | null;
  categoryNameRaw: string | null;
  stockOnHand: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  excludedAt: string | null;
  reenabledAt: string | null;
  // Tagged in client-side when merging results across multiple toggled
  // branches — not part of the API response itself.
  branchName?: string;
}

interface Branch {
  id: string;
  name: string;
}

type SortKey = "name" | "price" | "stock";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatKes(cents: number | null): string {
  if (cents == null) return "—";
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AdminZohoStagedItemsClient({ status }: { status: StagedStatus }) {
  const qc = useQueryClient();

  // Caller profile — determines whether the branch is fixed to the caller's
  // own branch, or needs a picker (global tier). Copied from
  // AdminInventoryClient's Zoho sync branch-picker pattern.
  const { data: me } = useAdminMe();
  const isGlobalTier = !!me && (me.isSuperAdmin || !me.branchId);

  // Branch list, only needed for the global-tier picker.
  const { data: branchesData } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: () => fetch("/api/admin/branches").then((r) => r.json()),
    enabled: isGlobalTier,
  });
  const branches: Branch[] = branchesData?.data?.branches ?? [];

  // Toggled branches (global tier only) — persisted per user. Empty means
  // "no explicit selection yet", which defaults to every branch toggled on.
  const [toggledBranchIds, setToggledBranchIds] = usePersistedFilter<string[]>(
    `zoho-staged-items:${status}:branches`,
    []
  );
  const selectedBranchIds = isGlobalTier
    ? toggledBranchIds.length > 0
      ? toggledBranchIds
      : branches.map((b) => b.id)
    : me?.branchId
      ? [me.branchId]
      : [];

  function toggleBranch(id: string) {
    const base = toggledBranchIds.length > 0 ? toggledBranchIds : branches.map((b) => b.id);
    const next = base.includes(id) ? base.filter((b) => b !== id) : [...base, id];
    setToggledBranchIds(next);
  }

  // ── Data fetch ────────────────────────────────────────────────────────────
  // GET /api/admin/zoho/staged-items?branchId=...&status=PENDING|EXCLUDED
  // Each branch runs its own independent Zoho org, so a multi-branch toggle
  // means one query per selected branch, merged client-side.
  const branchQueries = useQueries({
    queries: selectedBranchIds.map((branchId) => ({
      queryKey: ["admin-zoho-staged-items", status, branchId],
      queryFn: () =>
        fetch(`/api/admin/zoho/staged-items?branchId=${encodeURIComponent(branchId)}&status=${status}`).then((r) =>
          r.json()
        ),
    })),
  });

  const isLoading = selectedBranchIds.length === 0 || branchQueries.some((q) => q.isLoading);

  // Recomputed every render (cheap for staged-item list sizes) rather than
  // memoized — branchQueries is a fresh array each render (useQueries), so
  // there's no stable dependency to memoize against anyway.
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const items: ZohoStagedItem[] = branchQueries.flatMap((q, i) => {
    const branchId = selectedBranchIds[i];
    const rows: ZohoStagedItem[] = q.data?.data?.items ?? [];
    return rows.map((row) => ({ ...row, branchName: branchNameById.get(branchId) }));
  });

  // Search + sort — persisted per user, applied client-side over the
  // merged, already-fetched item list (same pattern as the other admin list
  // pages, e.g. AdminInventoryClient/AdminOrdersClient).
  const [search, setSearch] = usePersistedFilter(`zoho-staged-items:${status}:search`, "");
  const [sort, setSort] = usePersistedFilter<SortKey>(`zoho-staged-items:${status}:sort`, "name");

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q))
      : items;
    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "price") sorted.sort((a, b) => (b.rateKes ?? 0) - (a.rateKes ?? 0));
    else if (sort === "stock") sorted.sort((a, b) => (b.stockOnHand ?? 0) - (a.stockOnHand ?? 0));
    return sorted;
  }, [items, search, sort]);

  function invalidate() {
    // Both the PENDING and EXCLUDED pages share this key prefix — an item
    // moving between them means both lists are stale.
    qc.invalidateQueries({ queryKey: ["admin-zoho-staged-items"] });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const promoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/zoho/staged-items/${id}/promote`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to add product");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Added to Products");
      invalidate();
      // The live catalog list may already be cached from the Products page.
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => {
      console.error("[zoho-staged-items/promote]", e);
      toast.error(e.message);
    },
  });

  const excludeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/zoho/staged-items/${id}/exclude`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to delete item");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Item excluded — it won't resurface on future Zoho syncs");
      invalidate();
      setConfirmTarget(null);
    },
    onError: (e: Error) => {
      console.error("[zoho-staged-items/exclude]", e);
      toast.error(e.message);
    },
  });

  const reenableMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/zoho/staged-items/${id}/reenable`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to re-enable item");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Item re-enabled — back in the review queue");
      invalidate();
    },
    onError: (e: Error) => {
      console.error("[zoho-staged-items/reenable]", e);
      toast.error(e.message);
    },
  });

  // Exclusion is sticky/permanent (excluded items never resurface on
  // re-sync) — confirm before calling it.
  const [confirmTarget, setConfirmTarget] = useState<ZohoStagedItem | null>(null);

  // ── Table columns ─────────────────────────────────────────────────────────
  const showBranchColumn = isGlobalTier && selectedBranchIds.length > 1;
  const columns = useMemo(() => {
    const dateKey = status === "PENDING" ? "firstSeenAt" : "excludedAt";
    const dateLabel = status === "PENDING" ? "First Seen" : "Excluded";

    return [
      {
        key: "name",
        label: "Product",
        render: (_: unknown, row: Record<string, unknown>) => {
          const item = row as unknown as ZohoStagedItem;
          return (
            <div>
              <div className="font-dm text-[14px] font-medium text-(--neutral-900)">{item.name}</div>
              <div className="font-dm text-[12px] text-(--neutral-400)">{item.sku ? `SKU: ${item.sku}` : "No SKU"}</div>
            </div>
          );
        },
      },
      ...(showBranchColumn
        ? [
            {
              key: "branchName",
              label: "Branch",
              render: (v: unknown) => <span className="font-dm text-[13px] text-(--neutral-500)">{v ? String(v) : "—"}</span>,
            },
          ]
        : []),
      {
        key: "categoryNameRaw",
        label: "Category",
        sortable: true,
        render: (v: unknown) => <span className="font-dm text-[14px] text-(--neutral-700)">{v ? String(v) : "—"}</span>,
      },
      {
        key: "brand",
        label: "Brand",
        render: (v: unknown) => <span className="font-dm text-[14px] text-(--neutral-700)">{v ? String(v) : "—"}</span>,
      },
      {
        key: "zohoStatus",
        label: "Zoho Status",
        render: (v: unknown) => (v ? <StatusPill status={String(v)} /> : <span className="font-dm text-[13px] text-(--neutral-400)">—</span>),
      },
      {
        key: "rateKes",
        label: "Price",
        sortable: true,
        render: (v: unknown) => (
          <span className="font-dm text-[14px] font-semibold text-(--neutral-900)">{formatKes(v as number | null)}</span>
        ),
      },
      {
        key: "stockOnHand",
        label: "Stock",
        sortable: true,
        render: (v: unknown) => <span className="font-dm text-[14px] text-(--neutral-700)">{v == null ? "—" : String(v)}</span>,
      },
      {
        key: dateKey,
        label: dateLabel,
        sortable: true,
        render: (v: unknown) => <span className="font-dm text-[13px] text-(--neutral-500)">{formatDate(v as string | null)}</span>,
      },
      {
        key: "id",
        label: "Actions",
        render: (_: unknown, row: Record<string, unknown>) => {
          const item = row as unknown as ZohoStagedItem;

          if (status === "PENDING") {
            const isPromoting = promoteMutation.isPending && promoteMutation.variables === item.id;
            return (
              <div className="flex items-center gap-2">
                <Can permissions={{ products: ["create"] }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      promoteMutation.mutate(item.id);
                    }}
                    disabled={isPromoting}
                    className="h-8 px-3 rounded-[6px] font-dm text-[13px] font-medium bg-(--green-800) text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Plus size={13} /> {isPromoting ? "Adding…" : "Add to Products"}
                  </button>
                </Can>
                <Can permissions={{ products: ["delete"] }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmTarget(item);
                    }}
                    className="h-8 px-3 rounded-[6px] font-dm text-[13px] font-medium bg-(--danger-bg) text-(--danger) hover:opacity-80 transition-opacity flex items-center gap-1.5"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </Can>
              </div>
            );
          }

          const isReenabling = reenableMutation.isPending && reenableMutation.variables === item.id;
          return (
            <Can permissions={{ products: ["update"] }}>
              <label
                className="flex items-center gap-2.5 cursor-pointer select-none w-fit"
                onClick={(e) => e.stopPropagation()}
              >
                <Switch checked={false} onChange={() => reenableMutation.mutate(item.id)} disabled={isReenabling} />
                <span className="font-dm text-[13px] text-(--neutral-700)">{isReenabling ? "Re-enabling…" : "Re-enable"}</span>
              </label>
            </Can>
          );
        },
      },
    ];
  }, [status, promoteMutation, reenableMutation, showBranchColumn]);

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        breadcrumbs={[
          { label: "Products", href: "/admin/products" },
          { label: status === "PENDING" ? "Zoho Products" : "Expelled Zoho Products", href: status === "PENDING" ? "/admin/products/zoho" : "/admin/products/zoho/expelled" },
        ]}
        title={status === "PENDING" ? "Zoho Products" : "Expelled Zoho Products"}
        description={
          status === "PENDING"
            ? "New items pulled from Zoho, awaiting review before they go live."
            : "Items excluded from the catalog. Re-enable to send them back to the review queue."
        }
      />

      <div className="px-6 pb-6 space-y-4">
        {/* Filter toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400)" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or SKU..."
              className="w-full h-10 pl-9 pr-4 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent"
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-10 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-700) focus:outline-none focus:ring-2 focus:ring-(--green-500) appearance-none cursor-pointer"
            >
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price</option>
              <option value="stock">Sort: Stock</option>
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
          </div>

          {/* Branch toggle — global-tier callers only. Each branch runs its
              own independent Zoho org, so this multi-selects which branches'
              queues are merged into the list below (all on by default). */}
          {isGlobalTier && branches.length > 0 && (
            <div className="flex flex-wrap gap-1.5 sm:ml-auto">
              {branches.map((b) => {
                const active = selectedBranchIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBranch(b.id)}
                    className={[
                      "h-9 px-3 rounded-[8px] font-dm text-[13px] font-medium border transition-colors",
                      active
                        ? "bg-(--green-800) border-(--green-800) text-white"
                        : "bg-white border-(--neutral-200) text-(--neutral-600) hover:bg-(--neutral-50)",
                    ].join(" ")}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DataTable
          columns={columns}
          data={visibleItems as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle={status === "PENDING" ? "No items to review" : "No excluded items"}
          emptyDescription={
            status === "PENDING"
              ? "Everything pulled from Zoho has already been reviewed."
              : "Items you delete from the review queue will show up here."
          }
          pageSize={25}
        />
      </div>

      {/* Exclusion confirm — sticky/permanent, so this is a hard stop before calling exclude. */}
      <ConfirmModal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => confirmTarget && excludeMutation.mutate(confirmTarget.id)}
        title="Delete this item?"
        description={`"${confirmTarget?.name ?? ""}" will be excluded from future Zoho syncs. You can bring it back later from Expelled Zoho Products.`}
        confirmLabel="Delete"
        danger
        loading={excludeMutation.isPending}
      />
    </div>
  );
}
