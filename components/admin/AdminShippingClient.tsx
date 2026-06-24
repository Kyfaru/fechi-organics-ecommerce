"use client";

import { useState } from "react";
import { Plus, Truck, ChevronDown } from "lucide-react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";
import Switch from "@/components/ui/Switch";

// ---------------------------------------------------------------------------
// Types
// NOTE: Shipping zones are currently managed as local state until a
// `shippingZone` model is added to the Prisma schema.
// TODO: Persist zones to database via /api/admin/shipping/zones
// ---------------------------------------------------------------------------
type ShippingZone = {
  id: string;
  name: string;
  regions: string;
  feeKes: number;  // in cents
  deliveryDays: string;
  isActive: boolean;
};

type ZoneForm = {
  name: string;
  regions: string;
  feeKes: string;
  deliveryDays: string;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Initial hardcoded data (Kenya standard zones)
// ---------------------------------------------------------------------------
const INITIAL_ZONES: ShippingZone[] = [
  { id: "1", name: "Nairobi", regions: "Nairobi County", feeKes: 20000, deliveryDays: "1–2 business days", isActive: true },
  { id: "2", name: "Mombasa", regions: "Mombasa County", feeKes: 35000, deliveryDays: "2–3 business days", isActive: true },
  { id: "3", name: "Rest of Kenya", regions: "All other counties", feeKes: 50000, deliveryDays: "3–5 business days", isActive: true },
  { id: "4", name: "International", regions: "Outside Kenya", feeKes: 250000, deliveryDays: "7–14 business days", isActive: false },
];

const inputCls =
  "w-full font-dm text-[14px] text-(--neutral-900) rounded-[8px] border border-(--neutral-200) bg-white px-3 py-2 focus:outline-none focus:border-(--green-800) transition-colors placeholder:text-(--neutral-400)";
const labelCls =
  "block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5";

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE")}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminShippingClient() {
  const [zones, setZones] = useState<ShippingZone[]>(INITIAL_ZONES);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ShippingZone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState<ZoneForm>({
    name: "", regions: "", feeKes: "", deliveryDays: "", isActive: true,
  });

  function openCreate() {
    setEditing(null);
    setForm({ name: "", regions: "", feeKes: "", deliveryDays: "", isActive: true });
    setDrawerOpen(true);
  }

  function openEdit(zone: ShippingZone) {
    setEditing(zone);
    setForm({
      name: zone.name,
      regions: zone.regions,
      feeKes: String(zone.feeKes / 100),
      deliveryDays: zone.deliveryDays,
      isActive: zone.isActive,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setTimeout(() => setEditing(null), 250);
  }

  function patchForm(patch: Partial<ZoneForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Zone name is required"); return; }
    if (!form.feeKes || isNaN(Number(form.feeKes))) { toast.error("Enter a valid fee"); return; }

    const feeKes = Math.round(Number(form.feeKes) * 100);

    if (editing) {
      // TODO: PATCH /api/admin/shipping/zones/${editing.id}
      setZones((prev) =>
        prev.map((z) =>
          z.id === editing.id
            ? { ...z, name: form.name, regions: form.regions, feeKes, deliveryDays: form.deliveryDays, isActive: form.isActive }
            : z
        )
      );
      toast.success("Zone updated");
    } else {
      // TODO: POST /api/admin/shipping/zones
      const newZone: ShippingZone = {
        id: Date.now().toString(),
        name: form.name,
        regions: form.regions,
        feeKes,
        deliveryDays: form.deliveryDays,
        isActive: form.isActive,
      };
      setZones((prev) => [...prev, newZone]);
      toast.success("Zone created");
    }
    closeDrawer();
  }

  function handleDelete(id: string) {
    // TODO: DELETE /api/admin/shipping/zones/${id}
    setZones((prev) => prev.filter((z) => z.id !== id));
    toast.success("Zone deleted");
    setDeleteTarget(null);
  }

  const columns = [
    {
      key: "name",
      label: "Zone Name",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const z = row as unknown as ShippingZone;
        return (
          <div className="flex items-center gap-2.5 py-1">
            <div className="w-8 h-8 rounded-[6px] bg-(--green-50) flex items-center justify-center shrink-0">
              <Truck size={14} className="text-(--green-800)" />
            </div>
            <span className="font-dm text-[14px] font-medium text-(--neutral-900)">{z.name}</span>
          </div>
        );
      },
    },
    {
      key: "regions",
      label: "Regions",
      render: (_: unknown, row: Record<string, unknown>) => {
        const z = row as unknown as ShippingZone;
        return <span className="font-dm text-[13px] text-(--neutral-500)">{z.regions}</span>;
      },
    },
    {
      key: "feeKes",
      label: "Fee",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const z = row as unknown as ShippingZone;
        return <span className="font-dm text-[14px] font-semibold text-(--neutral-900)">{formatKes(z.feeKes)}</span>;
      },
    },
    {
      key: "deliveryDays",
      label: "Delivery Time",
      render: (_: unknown, row: Record<string, unknown>) => {
        const z = row as unknown as ShippingZone;
        return <span className="font-dm text-[13px] text-(--neutral-700)">{z.deliveryDays}</span>;
      },
    },
    {
      key: "isActive",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const z = row as unknown as ShippingZone;
        return <StatusPill status={z.isActive ? "active" : "draft"} />;
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const z = row as unknown as ShippingZone;
        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => openEdit(z)}
              className="h-8 px-3 rounded-[6px] font-dm text-[12px] text-(--neutral-700) border border-(--neutral-200) hover:bg-(--neutral-50) transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => setDeleteTarget(z.id)}
              className="h-8 px-3 rounded-[6px] font-dm text-[12px] text-(--danger) border border-(--danger-bg) bg-(--danger-bg) hover:opacity-80 transition-opacity"
            >
              Delete
            </button>
          </div>
        );
      },
    },
  ];

  const addButton = (
    <button
      onClick={openCreate}
      className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
    >
      <Plus size={16} /> Add Zone
    </button>
  );

  const drawerFooter = (
    <>
      <button
        onClick={closeDrawer}
        className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) mr-auto transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={handleSubmit}
        className="h-9 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
      >
        {editing ? "Save Changes" : "Create Zone"}
      </button>
    </>
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Shipping Zones"
        description="Configure delivery regions and fees"
        breadcrumbs={[
          { label: "Orders", href: "/admin/orders" },
          { label: "Shipping", href: "/admin/orders/shipping" },
        ]}
        action={addButton}
      />

      <div className="px-6">
        <DataTable
          columns={columns}
          data={zones as unknown as Record<string, unknown>[]}
          loading={false}
          onRowClick={(row) => openEdit(row as unknown as ShippingZone)}
          emptyTitle="No shipping zones"
          emptyDescription="Add shipping zones to configure delivery fees."
          pageSize={20}
        />
      </div>

      {/* Zone Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit Shipping Zone" : "Add Shipping Zone"}
        width={480}
        footer={drawerFooter}
      >
        <div className="flex flex-col gap-5">
          <div>
            <label className={labelCls}>Zone Name *</label>
            <input
              className={inputCls}
              placeholder="e.g. Nairobi"
              value={form.name}
              onChange={(e) => patchForm({ name: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}>Regions Covered</label>
            <input
              className={inputCls}
              placeholder="e.g. Nairobi County, Kiambu County"
              value={form.regions}
              onChange={(e) => patchForm({ regions: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Fee (KES) *</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                placeholder="200"
                value={form.feeKes}
                onChange={(e) => patchForm({ feeKes: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Delivery Time</label>
              <div className="relative">
                <select
                  value={form.deliveryDays}
                  onChange={(e) => patchForm({ deliveryDays: e.target.value })}
                  className={`${inputCls} appearance-none pr-8`}
                >
                  <option value="">Select…</option>
                  <option value="Same day">Same day</option>
                  <option value="1–2 business days">1–2 business days</option>
                  <option value="2–3 business days">2–3 business days</option>
                  <option value="3–5 business days">3–5 business days</option>
                  <option value="5–7 business days">5–7 business days</option>
                  <option value="7–14 business days">7–14 business days</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <Switch
              checked={form.isActive}
              onChange={(v) => patchForm({ isActive: v })}
            />
            <span className="font-dm text-[13px] text-(--neutral-700)">Active (available at checkout)</span>
          </label>
        </div>
      </Drawer>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete shipping zone?"
        description="Customers will no longer be able to select this zone at checkout."
        confirmLabel="Delete Zone"
        danger
      />
    </div>
  );
}
