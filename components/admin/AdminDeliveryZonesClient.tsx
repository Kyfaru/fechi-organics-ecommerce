"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, MapPin, Plus, Trash2, Truck } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { Drawer } from "@/components/admin/ui/Drawer";
import { StatsCard } from "@/components/ui/stats-card";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";
import { KENYA_COUNTIES } from "@/lib/kenya-counties";
import { toast } from "@/lib/toast";

type Branch = { id: string; name: string; county: string; phone?: string | null; isActive: boolean; mpesaType?: string; shortcode?: string | null };
type Zone = {
  id: string;
  county: string;
  name: string;
  branchId: string | null;
  deliveryFeeKes: number;
  isActive: boolean;
  branch: Branch | null;
};

type FormState = {
  county: string;
  name: string;
  branchId: string;
  deliveryFeeKes: string;
  isActive: boolean;
};

const blankForm: FormState = {
  county: "Nairobi",
  name: "",
  branchId: "",
  deliveryFeeKes: "350",
  isActive: true,
};

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

type BranchForm = { name: string; county: string; phone: string; isActive: boolean };

export function AdminDeliveryZonesClient() {
  const qc = useQueryClient();
  const [countyFilter, setCountyFilter] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);

  // Branch management state
  const [branchDrawerOpen, setBranchDrawerOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState<BranchForm>({ name: "", county: "Nairobi", phone: "", isActive: true });

  const zonesQuery = useQuery<{ ok: boolean; data: { zones: Zone[] } }>({
    queryKey: ["admin-delivery-zones", countyFilter],
    queryFn: () => fetch(`/api/admin/delivery-zones${countyFilter ? `?county=${encodeURIComponent(countyFilter)}` : ""}`).then((r) => r.json()),
  });

  const branchesQuery = useQuery<{ ok: boolean; data: { branches: Branch[] } }>({
    queryKey: ["admin-branches"],
    queryFn: () => fetch("/api/admin/branches").then((r) => r.json()),
  });

  const zones = zonesQuery.data?.data?.zones ?? [];
  const branches = branchesQuery.data?.data?.branches ?? [];

  const saveBranchMutation = useMutation({
    mutationFn: async () => {
      if (!editingBranch) return;
      const res = await fetch(`/api/admin/branches/${editingBranch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: branchForm.name.trim(),
          county: branchForm.county,
          phone: branchForm.phone.trim() || null,
          isActive: branchForm.isActive,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Save failed");
    },
    onSuccess: () => {
      toast.success("Branch updated.");
      qc.invalidateQueries({ queryKey: ["admin-branches"] });
      setBranchDrawerOpen(false);
      setEditingBranch(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openBranchEdit(branch: Branch) {
    setEditingBranch(branch);
    setBranchForm({
      name: branch.name,
      county: branch.county,
      phone: branch.phone ?? "",
      isActive: branch.isActive,
    });
    setBranchDrawerOpen(true);
  }

  const branchColumns = useMemo(() => [
    { key: "name", label: "Branch", sortable: true },
    { key: "county", label: "County", sortable: true },
    {
      key: "phone",
      label: "Phone",
      render: (value: unknown) => <span className="text-(--neutral-500)">{(value as string | null) ?? "—"}</span>,
    },
    {
      key: "isActive",
      label: "Active",
      render: (value: unknown) => <span className={Boolean(value) ? "text-(--success)" : "text-(--neutral-400)"}>{Boolean(value) ? "Active" : "Inactive"}</span>,
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const branch = row as unknown as Branch;
        return (
          <div className="flex items-center justify-end gap-1">
            <button onClick={(e) => { e.stopPropagation(); openBranchEdit(branch); }} className="w-8 h-8 rounded-[6px] hover:bg-(--neutral-100) flex items-center justify-center"><Edit size={14} /></button>
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);
  const activeZones = zones.filter((z) => z.isActive).length;
  const avgFee = zones.length ? Math.round(zones.reduce((sum, z) => sum + z.deliveryFeeKes, 0) / zones.length) : 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        county: form.county,
        name: form.name.trim(),
        branchId: form.branchId || null,
        deliveryFeeKes: Math.round(Number(form.deliveryFeeKes || 0) * 100),
        isActive: form.isActive,
      };
      const res = await fetch(editing ? `/api/admin/delivery-zones/${editing.id}` : "/api/admin/delivery-zones", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Save failed");
    },
    onSuccess: () => {
      toast.success(editing ? "Delivery zone updated." : "Delivery zone created.");
      qc.invalidateQueries({ queryKey: ["admin-delivery-zones"] });
      setDrawerOpen(false);
      setEditing(null);
      setForm(blankForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (zone: Zone) => {
      const res = await fetch(`/api/admin/delivery-zones/${zone.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Delete failed");
    },
    onSuccess: () => {
      toast.success("Delivery zone deleted.");
      qc.invalidateQueries({ queryKey: ["admin-delivery-zones"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo(() => [
    { key: "county", label: "County", sortable: true },
    { key: "name", label: "Zone", sortable: true },
    {
      key: "branch",
      label: "Branch",
      render: (_: unknown, row: Record<string, unknown>) => {
        const zone = row as unknown as Zone;
        return <span>{zone.branch?.name ?? "Unassigned"}</span>;
      },
    },
    {
      key: "deliveryFeeKes",
      label: "Fee",
      sortable: true,
      render: (value: unknown) => <span className="font-semibold">{formatKes(Number(value))}</span>,
    },
    {
      key: "isActive",
      label: "Active",
      render: (value: unknown) => <span className={Boolean(value) ? "text-(--success)" : "text-(--neutral-400)"}>{Boolean(value) ? "Active" : "Paused"}</span>,
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const zone = row as unknown as Zone;
        return (
          <div className="flex items-center justify-end gap-1">
            <button onClick={(e) => { e.stopPropagation(); openEdit(zone); }} className="w-8 h-8 rounded-[6px] hover:bg-(--neutral-100) flex items-center justify-center"><Edit size={14} /></button>
            <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(zone); }} className="w-8 h-8 rounded-[6px] hover:bg-(--danger-bg) text-(--danger) flex items-center justify-center"><Trash2 size={14} /></button>
          </div>
        );
      },
    },
  ], []);

  function openCreate() {
    setEditing(null);
    setForm(blankForm);
    setDrawerOpen(true);
  }

  function openEdit(zone: Zone) {
    setEditing(zone);
    setForm({
      county: zone.county,
      name: zone.name,
      branchId: zone.branchId ?? "",
      deliveryFeeKes: String(zone.deliveryFeeKes / 100),
      isActive: zone.isActive,
    });
    setDrawerOpen(true);
  }

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader title="Delivery Zones" description="Manage delivery zones, branch routing, and checkout fees" />

      <div className="px-6 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
  title="Zones"
  value={String(zones.length)}
  icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
  change="—"
  changeType="positive"
/>

<StatsCard
  title="Active"
  value={String(activeZones)}
  icon={<Truck className="h-4 w-4 text-muted-foreground" />}
  change="Active"
  changeType="positive"
/>

<StatsCard
  title="Average Fee"
  value={avgFee ? formatKes(avgFee) : "KES 0"}
  icon={<Truck className="h-4 w-4 text-muted-foreground" />}
  change="Average"
  changeType="positive"
/>
      </div>

      <div className="px-6 mb-5 flex flex-wrap items-center gap-3">
        <select value={countyFilter} onChange={(e) => setCountyFilter(e.target.value)} className="h-9 px-3 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] bg-white">
          <option value="">All counties</option>
          {KENYA_COUNTIES.map((county) => <option key={county} value={county}>{county}</option>)}
        </select>
        <button onClick={openCreate} className="ml-auto h-9 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[13px] font-medium flex items-center gap-2">
          <Plus size={14} /> New Zone
        </button>
      </div>

      <div className="px-6">
        <DataTable
          columns={columns}
          data={zones as unknown as Record<string, unknown>[]}
          loading={zonesQuery.isLoading}
          onRowClick={(row) => openEdit(row as unknown as Zone)}
          emptyTitle="No delivery zones"
          emptyDescription="Create zones so customers can pick accurate checkout delivery fees."
          pageSize={25}
        />
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editing ? "Edit Delivery Zone" : "New Delivery Zone"} footer={
        <>
          <button onClick={() => setDrawerOpen(false)} className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px]">Cancel</button>
          <button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending} className="h-9 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[13px] disabled:opacity-50">Save Zone</button>
        </>
      }>
        <div className="space-y-4">
          <Field label="County">
            <select value={form.county} onChange={(e) => setForm((p) => ({ ...p, county: e.target.value }))} className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200)">
              {KENYA_COUNTIES.map((county) => <option key={county} value={county}>{county}</option>)}
            </select>
          </Field>
          <Field label="Zone name">
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200)" placeholder="Westlands" />
          </Field>
          <Field label="Branch">
            <select value={form.branchId} onChange={(e) => setForm((p) => ({ ...p, branchId: e.target.value }))} className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200)">
              <option value="">No branch routing</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} - {branch.county}</option>)}
            </select>
          </Field>
          <Field label="Delivery fee (KES)">
            <input type="number" min="0" value={form.deliveryFeeKes} onChange={(e) => setForm((p) => ({ ...p, deliveryFeeKes: e.target.value }))} className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200)" />
          </Field>
          <label className="flex items-center gap-2 font-dm text-[13px]">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
            Active zone
          </label>
        </div>
      </Drawer>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="Delete delivery zone?"
        description="Customers will no longer be able to select this zone at checkout."
        confirmLabel="Delete Zone"
        danger
        loading={deleteMutation.isPending}
      />

      {/* ── Branches section ── */}
      <div className="px-6 pt-8 pb-2">
        <h2 className="font-dm font-semibold text-[16px] text-(--neutral-900)">Branches</h2>
        <p className="font-dm text-[13px] text-(--neutral-500) mt-0.5">Click a branch to update its name, county, phone, or active status</p>
      </div>
      <div className="px-6 pb-8">
        <DataTable
          columns={branchColumns}
          data={branches as unknown as Record<string, unknown>[]}
          loading={branchesQuery.isLoading}
          onRowClick={(row) => openBranchEdit(row as unknown as Branch)}
          emptyTitle="No branches"
          emptyDescription="Add branches so pickup orders can show the correct location and phone."
          pageSize={10}
        />
      </div>

      <Drawer open={branchDrawerOpen} onClose={() => setBranchDrawerOpen(false)} title="Edit Branch" footer={
        <>
          <button onClick={() => setBranchDrawerOpen(false)} className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px]">Cancel</button>
          <button onClick={() => saveBranchMutation.mutate()} disabled={!branchForm.name.trim() || saveBranchMutation.isPending} className="h-9 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[13px] disabled:opacity-50">Save Branch</button>
        </>
      }>
        <div className="space-y-4">
          <Field label="Branch name">
            <input value={branchForm.name} onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))} className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200)" placeholder="Westlands Branch" />
          </Field>
          <Field label="County">
            <select value={branchForm.county} onChange={(e) => setBranchForm((p) => ({ ...p, county: e.target.value }))} className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200)">
              {KENYA_COUNTIES.map((county) => <option key={county} value={county}>{county}</option>)}
            </select>
          </Field>
          <Field label="Phone number (optional)">
            <input value={branchForm.phone} onChange={(e) => setBranchForm((p) => ({ ...p, phone: e.target.value }))} className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-200)" placeholder="+254 700 000 000" />
          </Field>
          <label className="flex items-center gap-2 font-dm text-[13px]">
            <input type="checkbox" checked={branchForm.isActive} onChange={(e) => setBranchForm((p) => ({ ...p, isActive: e.target.checked }))} />
            Active branch
          </label>
        </div>
      </Drawer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">{label}</label>
      {children}
    </div>
  );
}
