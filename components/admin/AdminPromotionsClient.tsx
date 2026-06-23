"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Tag, RefreshCw, ChevronDown, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";

// ── Types ────────────────────────────────────────────────────────────────────

interface Promotion {
  id: string;
  name: string;
  type: string;
  value: number;
  code: string | null;
  minOrder: number | null;
  maxUses: number | null;
  usedCount: number;
  startDate: string | null;
  endDate: string | null;
  status: string;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: "% Off",
  FIXED: "KES Off",
  FREE_SHIPPING: "Free Ship",
};

const TYPE_COLORS: Record<string, string> = {
  PERCENTAGE: "bg-(--green-50) text-(--green-800)",
  FIXED: "bg-(--gold-50) text-(--gold-700)",
  FREE_SHIPPING: "bg-(--info)/10 text-(--info)",
};

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Component ────────────────────────────────────────────────────────────────

export function AdminPromotionsClient() {
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"promotions" | "coupons">("promotions");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);

  const EMPTY_FORM = {
    name: "",
    type: "PERCENTAGE",
    value: "",
    code: "",
    minOrder: "",
    maxUses: "",
    startDate: "",
    endDate: "",
    status: "active",
  };
  const [form, setForm] = useState(EMPTY_FORM);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: () => fetch("/api/admin/promotions").then((r) => r.json()),
  });

  const allPromos: Promotion[] = data?.data ?? [];

  // Tab filter: promotions = no code, coupons = has code
  const filtered = allPromos.filter((p) =>
    activeTab === "coupons" ? !!p.code : true
  );

  // ── Create/Update ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        type: form.type,
        value: Number(form.value),
        code: form.code || null,
        minOrder: form.minOrder ? Number(form.minOrder) : null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        status: form.status,
      };

      const url = editTarget ? `/api/admin/promotions/${editTarget.id}` : "/api/admin/promotions";
      const method = editTarget ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to save promotion");
      return json.data;
    },
    onSuccess: (p: Promotion) => {
      toast.success(`Promotion "${p.name}" ${editTarget ? "updated" : "created"}`);
      qc.invalidateQueries({ queryKey: ["admin-promotions"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/promotions/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to delete");
    },
    onSuccess: () => {
      toast.success("Promotion deleted");
      qc.invalidateQueries({ queryKey: ["admin-promotions"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  }

  function openEdit(p: Promotion) {
    setEditTarget(p);
    setForm({
      name: p.name,
      type: p.type,
      value: String(p.value),
      code: p.code ?? "",
      minOrder: p.minOrder ? String(p.minOrder) : "",
      maxUses: p.maxUses ? String(p.maxUses) : "",
      startDate: p.startDate ? p.startDate.slice(0, 10) : "",
      endDate: p.endDate ? p.endDate.slice(0, 10) : "",
      status: p.status,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditTarget(null);
  }

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (v: unknown) => (
        <span className="font-dm text-[14px] font-medium text-(--neutral-900)">{String(v)}</span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (v: unknown) => (
        <span className={`inline-block px-2 py-0.5 rounded-full font-dm text-[12px] font-medium ${TYPE_COLORS[String(v)] ?? "bg-(--neutral-100) text-(--neutral-700)"}`}>
          {TYPE_LABELS[String(v)] ?? String(v)}
        </span>
      ),
    },
    {
      key: "value",
      label: "Value",
      render: (v: unknown, row: Record<string, unknown>) => {
        const type = String(row.type);
        const val = Number(v);
        return (
          <span className="font-dm text-[14px] font-semibold text-(--neutral-900)">
            {type === "PERCENTAGE" ? `${val}%` : type === "FIXED" ? `KES ${val.toLocaleString()}` : "Free"}
          </span>
        );
      },
    },
    {
      key: "code",
      label: "Code",
      render: (v: unknown) =>
        v ? (
          <code className="px-2 py-0.5 rounded bg-(--neutral-100) font-dm text-[13px] font-semibold text-(--neutral-900) tracking-wider">
            {String(v)}
          </code>
        ) : (
          <span className="text-(--neutral-400) text-[14px]">—</span>
        ),
    },
    {
      key: "minOrder",
      label: "Min Order",
      render: (v: unknown) =>
        v ? (
          <span className="font-dm text-[14px] text-(--neutral-700)">KES {Number(v).toLocaleString()}</span>
        ) : (
          <span className="text-(--neutral-400)">—</span>
        ),
    },
    {
      key: "usedCount",
      label: "Uses",
      render: (v: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">
          {String(v)} / {String(row.maxUses ?? "∞")}
        </span>
      ),
    },
    {
      key: "startDate",
      label: "Start",
      render: (v: unknown) =>
        v ? new Date(String(v)).toLocaleDateString() : <span className="text-(--neutral-400)">—</span>,
    },
    {
      key: "endDate",
      label: "End",
      render: (v: unknown) =>
        v ? new Date(String(v)).toLocaleDateString() : <span className="text-(--neutral-400)">—</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (v: unknown) => <StatusPill status={String(v)} />,
    },
    {
      key: "id",
      label: "Actions",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as Promotion;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); openEdit(p); }}
              className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--neutral-100) hover:bg-(--neutral-200) text-(--neutral-700) transition-colors"
            >
              Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
              className="h-8 w-8 flex items-center justify-center rounded-[6px] text-(--neutral-400) hover:bg-(--danger-bg) hover:text-(--danger) transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  const valueLabel = form.type === "PERCENTAGE" ? "%" : form.type === "FIXED" ? "KES" : "";

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        title="Promotions"
        description="Discount codes and promotional offers"
        breadcrumbs={[
          { label: "Marketing", href: "/admin/marketing" },
          { label: "Promotions", href: "/admin/marketing/promotions" },
        ]}
        action={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
          >
            <Plus size={16} />
            Create Promotion
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-(--neutral-100) p-1 rounded-[10px] w-fit">
          {(["promotions", "coupons"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-8 px-4 rounded-[8px] font-dm text-[13px] font-medium transition-colors capitalize ${
                activeTab === tab
                  ? "bg-white text-(--neutral-900) shadow-(--e1)"
                  : "text-(--neutral-500) hover:text-(--neutral-700)"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No promotions yet"
          emptyDescription="Create your first promotion or coupon code."
          pageSize={20}
        />
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editTarget ? "Edit Promotion" : "Create Promotion"}
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
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim() || !form.value}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50 ml-auto"
            >
              {saveMutation.isPending ? "Saving..." : editTarget ? "Save Changes" : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldWrap label="Name" required>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Summer Sale 20%"
              className={inputCls}
            />
          </FieldWrap>

          <FieldWrap label="Type">
            <div className="relative">
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="PERCENTAGE">Percentage Off</option>
                <option value="FIXED">Fixed Amount Off</option>
                <option value="FREE_SHIPPING">Free Shipping</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          </FieldWrap>

          {form.type !== "FREE_SHIPPING" && (
            <FieldWrap label={`Value (${valueLabel})`} required>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={form.type === "PERCENTAGE" ? "20" : "500"}
                  className={`${inputCls} pr-12`}
                />
                {valueLabel && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-dm text-[13px] text-(--neutral-400)">
                    {valueLabel}
                  </span>
                )}
              </div>
            </FieldWrap>
          )}

          <FieldWrap label="Coupon Code" hint="Leave blank for automatic promotions">
            <div className="flex gap-2">
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="SAVE20 (optional)"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                className="h-10 px-3 rounded-[8px] border border-(--neutral-200) text-(--neutral-500) hover:bg-(--neutral-100) transition-colors flex items-center gap-1.5 font-dm text-[13px]"
                title="Generate code"
              >
                <RefreshCw size={13} />
                Generate
              </button>
            </div>
          </FieldWrap>

          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Min Order (KES)">
              <input
                type="number"
                min={0}
                value={form.minOrder}
                onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))}
                placeholder="e.g. 2000"
                className={inputCls}
              />
            </FieldWrap>
            <FieldWrap label="Max Uses">
              <input
                type="number"
                min={0}
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                placeholder="Unlimited"
                className={inputCls}
              />
            </FieldWrap>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Start Date">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className={inputCls}
              />
            </FieldWrap>
            <FieldWrap label="End Date">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className={inputCls}
              />
            </FieldWrap>
          </div>

          <FieldWrap label="Status">
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          </FieldWrap>
        </div>
      </Drawer>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        title="Delete Promotion"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function FieldWrap({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">
        {label} {required && <span className="text-(--danger)">*</span>}
        {hint && <span className="text-(--neutral-400) font-normal ml-1 text-[12px]">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow";
