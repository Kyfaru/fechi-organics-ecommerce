"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Truck, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";

// ── Types ────────────────────────────────────────────────────────────────────

interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  categories: string[];
  paymentTerms: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  purchaseOrders: PurchaseOrder[];
}

type DrawerMode = "create" | "edit";

const EMPTY_FORM = {
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
  categoriesRaw: "", // comma-separated string
  paymentTerms: "Net 30",
  notes: "",
  status: "active",
};

// ── Component ────────────────────────────────────────────────────────────────

export function AdminSuppliersClient() {
  const qc = useQueryClient();

  const [drawer, setDrawer] = useState<{ open: boolean; mode: DrawerMode; supplier: Supplier | null }>({
    open: false, mode: "create", supplier: null,
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["admin-suppliers"],
    queryFn: () => fetch("/api/admin/suppliers").then((r) => r.json()),
  });
  const suppliers: Supplier[] = data?.data ?? [];

  // ── Create ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          categories: form.categoriesRaw.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to create supplier");
      return json.data;
    },
    onSuccess: (s: Supplier) => {
      toast.success(`Supplier "${s.name}" created`);
      qc.invalidateQueries({ queryKey: ["admin-suppliers"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Update ────────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!drawer.supplier) return;
      const res = await fetch(`/api/admin/suppliers/${drawer.supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          categories: form.categoriesRaw.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update supplier");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Supplier updated");
      qc.invalidateQueries({ queryKey: ["admin-suppliers"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Delete (soft) ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/suppliers/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to deactivate supplier");
    },
    onSuccess: () => {
      toast.success("Supplier deactivated");
      qc.invalidateQueries({ queryKey: ["admin-suppliers"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer({ open: true, mode: "create", supplier: null });
  }

  function openEdit(s: Supplier) {
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      categoriesRaw: s.categories.join(", "),
      paymentTerms: s.paymentTerms ?? "Net 30",
      notes: s.notes ?? "",
      status: s.status,
    });
    setDrawer({ open: true, mode: "edit", supplier: s });
  }

  function closeDrawer() {
    setDrawer({ open: false, mode: "create", supplier: null });
  }

  function handleSubmit() {
    if (drawer.mode === "create") createMutation.mutate();
    else updateMutation.mutate();
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      key: "name",
      label: "Supplier",
      sortable: true,
      render: (v: unknown) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-(--green-50) flex items-center justify-center shrink-0">
            <Truck size={14} className="text-(--green-800)" />
          </div>
          <span className="font-dm text-[14px] font-medium text-(--neutral-900)">{String(v)}</span>
        </div>
      ),
    },
    {
      key: "contactPerson",
      label: "Contact",
      render: (v: unknown) => <span className="font-dm text-[14px] text-(--neutral-700)">{String(v || "—")}</span>,
    },
    {
      key: "email",
      label: "Email",
      render: (v: unknown) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">{String(v || "—")}</span>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      render: (v: unknown) => <span className="font-dm text-[14px] text-(--neutral-700)">{String(v || "—")}</span>,
    },
    {
      key: "categories",
      label: "Categories",
      render: (v: unknown) => {
        const cats = v as string[];
        return (
          <div className="flex flex-wrap gap-1">
            {cats.length ? cats.slice(0, 2).map((c) => (
              <span key={c} className="inline-block px-2 py-0.5 rounded-full bg-(--neutral-100) font-dm text-[11px] text-(--neutral-700)">{c}</span>
            )) : <span className="text-(--neutral-400) text-[14px]">—</span>}
            {cats.length > 2 && (
              <span className="font-dm text-[11px] text-(--neutral-400)">+{cats.length - 2}</span>
            )}
          </div>
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
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row as unknown as Supplier); }}
            className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--neutral-100) hover:bg-(--neutral-200) text-(--neutral-700) transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row as unknown as Supplier); }}
            className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--danger-bg) hover:bg-red-100 text-(--danger) transition-colors"
          >
            Deactivate
          </button>
        </div>
      ),
    },
  ];

  // ── PO mini-table for drawer ──────────────────────────────────────────────
  const selectedSupplier = drawer.supplier;

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        title="Suppliers"
        description="Manage your product suppliers"
        action={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
          >
            <Plus size={16} />
            Add Supplier
          </button>
        }
      />

      <div className="px-6 pb-6">
        <DataTable
          columns={columns}
          data={suppliers as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No suppliers yet"
          emptyDescription="Add your first supplier to get started."
          pageSize={20}
        />
      </div>

      {/* Add / Edit Drawer */}
      <Drawer
        open={drawer.open}
        onClose={closeDrawer}
        title={drawer.mode === "create" ? "Add Supplier" : "Edit Supplier"}
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
              onClick={handleSubmit}
              disabled={isPending || !form.name.trim()}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50 ml-auto"
            >
              {isPending ? "Saving..." : drawer.mode === "create" ? "Add Supplier" : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Supplier Name" required>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Green Valley Farms"
              className={inputCls}
            />
          </FormField>

          <FormField label="Contact Person">
            <input
              value={form.contactPerson}
              onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              placeholder="Full name"
              className={inputCls}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
                className={inputCls}
              />
            </FormField>
            <FormField label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+254..."
                className={inputCls}
              />
            </FormField>
          </div>

          <FormField label="Address">
            <textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
              placeholder="Physical address"
              className={`${inputCls} resize-none`}
            />
          </FormField>

          <FormField label="Categories Supplied" hint="Comma-separated, e.g. Face Care, Body Care">
            <input
              value={form.categoriesRaw}
              onChange={(e) => setForm((f) => ({ ...f, categoriesRaw: e.target.value }))}
              placeholder="Face Care, Body Care"
              className={inputCls}
            />
          </FormField>

          <FormField label="Payment Terms">
            <div className="relative">
              <select
                value={form.paymentTerms}
                onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option>Net 30</option>
                <option>Net 60</option>
                <option>COD</option>
                <option>Upfront</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          </FormField>

          <FormField label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Internal notes..."
              className={`${inputCls} resize-none`}
            />
          </FormField>

          <FormField label="Status">
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          </FormField>

          {/* Purchase Orders mini-table when editing */}
          {drawer.mode === "edit" && selectedSupplier && selectedSupplier.purchaseOrders.length > 0 && (
            <div>
              <div className="font-dm text-[13px] font-medium text-(--neutral-700) mb-2 mt-4">
                Recent Purchase Orders
              </div>
              <div className="rounded-[8px] border border-(--neutral-200) overflow-hidden">
                {selectedSupplier.purchaseOrders.map((po) => (
                  <div key={po.id} className="flex items-center justify-between px-3 py-2 border-b border-(--neutral-200) last:border-b-0 hover:bg-(--neutral-50)">
                    <div>
                      <div className="font-dm text-[13px] font-medium text-(--neutral-900)">{po.poNumber}</div>
                      <div className="font-dm text-[12px] text-(--neutral-400)">
                        {new Date(po.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-dm text-[13px] text-(--neutral-700)">
                        KES {(po.totalAmount / 100).toLocaleString()}
                      </span>
                      <StatusPill status={po.status.toLowerCase()} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Drawer>

      {/* Deactivate confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        title="Deactivate Supplier"
        description={`This will mark "${deleteTarget?.name}" as inactive. You can reactivate it later.`}
        confirmLabel="Deactivate"
        danger
      />
    </div>
  );
}

// ── Small reusable form helpers ───────────────────────────────────────────────

function FormField({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">
        {label} {required && <span className="text-(--danger)">*</span>}
        {hint && <span className="text-(--neutral-400) font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow";
