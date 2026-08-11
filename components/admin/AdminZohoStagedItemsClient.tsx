"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import Switch from "@/components/ui/Switch";
import { Can } from "@/components/admin/Can";
import { useAdminMe } from "@/hooks/use-can";
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
}

interface Branch {
  id: string;
  name: string;
}

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

  // Empty string means "not explicitly chosen yet" — falls back to the first
  // loaded branch below, without needing a setState-in-effect to seed it.
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const branchId = isGlobalTier ? selectedBranchId || branches[0]?.id || "" : me?.branchId ?? "";

  // ── Data fetch ────────────────────────────────────────────────────────────
  // GET /api/admin/zoho/staged-items?branchId=...&status=PENDING|EXCLUDED
  const { data, isLoading } = useQuery({
    queryKey: ["admin-zoho-staged-items", status, branchId],
    queryFn: () =>
      fetch(`/api/admin/zoho/staged-items?branchId=${encodeURIComponent(branchId)}&status=${status}`).then((r) =>
        r.json()
      ),
    enabled: !!branchId,
  });

  const items: ZohoStagedItem[] = data?.data?.items ?? [];

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
  }, [status, promoteMutation, reenableMutation]);

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        title={status === "PENDING" ? "Zoho Products" : "Expelled Zoho Products"}
        description={
          status === "PENDING"
            ? "New items pulled from Zoho, awaiting review before they go live."
            : "Items excluded from the catalog. Re-enable to send them back to the review queue."
        }
        action={
          isGlobalTier ? (
            <div className="relative">
              <select
                value={branchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="h-10 pl-3 pr-8 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-700) focus:outline-none focus:ring-2 focus:ring-(--green-500) appearance-none cursor-pointer"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          ) : undefined
        }
      />

      <div className="px-6 pb-6">
        <DataTable
          columns={columns}
          data={items as unknown as Record<string, unknown>[]}
          loading={isLoading || !branchId}
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
