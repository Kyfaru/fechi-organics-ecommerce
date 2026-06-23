"use client";

import { useState } from "react";
import { Package, ChevronDown, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";

// ---------------------------------------------------------------------------
// Types
// NOTE: Tracking information is stored per-order. This page queries shipped
// orders and allows attaching tracking numbers.
// TODO: Add `trackingNumber`, `carrier`, `trackingStatus` fields to order model,
// or create a separate `shipment` model. Wire to /api/admin/orders/tracking.
// ---------------------------------------------------------------------------
type TrackingEntry = {
  orderId: string;
  orderShortId: string;
  customer: string;
  trackingNumber: string;
  carrier: string;
  currentLocation: string;
  status: string;
  lastUpdate: string;
};

type TrackingForm = {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  currentLocation: string;
  status: string;
};

const CARRIERS = ["DHL", "G4S", "Pickup (Nairobi)", "Sendy", "Wells Fargo Kenya", "Other"];

const inputCls =
  "w-full font-dm text-[14px] text-(--neutral-900) rounded-[8px] border border-(--neutral-200) bg-white px-3 py-2 focus:outline-none focus:border-(--green-800) transition-colors placeholder:text-(--neutral-400)";
const labelCls =
  "block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminTrackingClient() {
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TrackingEntry | null>(null);
  const [form, setForm] = useState<TrackingForm>({
    orderId: "", trackingNumber: "", carrier: "", currentLocation: "", status: "shipped",
  });

  // TODO: Replace with real API: GET /api/admin/orders?status=SHIPPED to get orders
  // needing tracking, then separately fetch tracking info per order.
  const { data, isLoading } = useQuery<{ ok: boolean; data: { entries: TrackingEntry[] } }>({
    queryKey: ["admin-tracking"],
    queryFn: async () => {
      console.info("[admin/tracking] Fetching tracking — API not yet implemented");
      return { ok: true, data: { entries: [] } };
    },
  });

  const entries = data?.data?.entries ?? [];

  const filtered = search
    ? entries.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.orderId.toLowerCase().includes(q) ||
          e.customer.toLowerCase().includes(q) ||
          e.trackingNumber.toLowerCase().includes(q)
        );
      })
    : entries;

  function openEdit(entry: TrackingEntry) {
    setEditing(entry);
    setForm({
      orderId: entry.orderId,
      trackingNumber: entry.trackingNumber,
      carrier: entry.carrier,
      currentLocation: entry.currentLocation,
      status: entry.status,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setTimeout(() => setEditing(null), 250);
  }

  function patchForm(patch: Partial<TrackingForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleSubmit() {
    if (!form.trackingNumber.trim()) { toast.error("Tracking number is required"); return; }
    // TODO: PATCH /api/admin/orders/${form.orderId}/tracking
    toast.info("Tracking update — API integration pending");
    closeDrawer();
  }

  const columns = [
    {
      key: "orderShortId",
      label: "Order",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const e = row as unknown as TrackingEntry;
        return <span className="font-dm text-[13px] font-semibold text-(--neutral-900) font-mono">{e.orderShortId}</span>;
      },
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const e = row as unknown as TrackingEntry;
        return <span className="font-dm text-[14px] text-(--neutral-700)">{e.customer}</span>;
      },
    },
    {
      key: "trackingNumber",
      label: "Tracking #",
      render: (_: unknown, row: Record<string, unknown>) => {
        const e = row as unknown as TrackingEntry;
        return <span className="font-dm text-[13px] font-mono text-(--neutral-900)">{e.trackingNumber || "—"}</span>;
      },
    },
    {
      key: "carrier",
      label: "Carrier",
      render: (_: unknown, row: Record<string, unknown>) => {
        const e = row as unknown as TrackingEntry;
        return <span className="font-dm text-[13px] text-(--neutral-700)">{e.carrier || "—"}</span>;
      },
    },
    {
      key: "status",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const e = row as unknown as TrackingEntry;
        return <StatusPill status={e.status} />;
      },
    },
    {
      key: "lastUpdate",
      label: "Last Update",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const e = row as unknown as TrackingEntry;
        if (!e.lastUpdate) return <span className="font-dm text-[13px] text-(--neutral-400)">—</span>;
        return (
          <span className="font-dm text-[12px] text-(--neutral-400)">
            {new Date(e.lastUpdate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const e = row as unknown as TrackingEntry;
        return (
          <button
            onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
            className="h-8 px-3 rounded-[6px] font-dm text-[12px] text-(--neutral-700) border border-(--neutral-200) hover:bg-(--neutral-50) transition-colors"
          >
            Update
          </button>
        );
      },
    },
  ];

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
        Save Tracking
      </button>
    </>
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Order Tracking"
        description="Update tracking information for shipped orders"
        breadcrumbs={[
          { label: "Orders", href: "/admin/orders" },
          { label: "Tracking", href: "/admin/orders/tracking" },
        ]}
      />

      {/* Search bar */}
      <div className="px-6 mb-5">
        <div className="relative w-[280px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order or customer…"
            className="w-full h-9 pl-9 pr-3 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-900) bg-white focus:outline-none focus:border-(--green-800) placeholder:text-(--neutral-400) transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) hover:text-(--neutral-700)">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="px-6">
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          loading={isLoading}
          onRowClick={(row) => openEdit(row as unknown as TrackingEntry)}
          emptyTitle="No shipments yet"
          emptyDescription="Shipped orders will appear here once tracking is implemented."
          pageSize={25}
        />
      </div>

      {/* Update Tracking Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Update Tracking"
        width={480}
        footer={drawerFooter}
      >
        {editing && (
          <div className="flex flex-col gap-5">
            {/* Order reference */}
            <div className="bg-(--neutral-50) rounded-[10px] p-3 border border-(--neutral-200)">
              <div className="flex items-center gap-2">
                <Package size={15} className="text-(--neutral-400)" />
                <p className="font-dm text-[13px] font-medium text-(--neutral-700)">
                  Order <span className="font-mono text-(--neutral-900)">{editing.orderShortId}</span>
                  {" — "}{editing.customer}
                </p>
              </div>
            </div>

            <div>
              <label className={labelCls}>Tracking Number *</label>
              <input
                className={inputCls}
                placeholder="e.g. DHL1234567890"
                value={form.trackingNumber}
                onChange={(e) => patchForm({ trackingNumber: e.target.value })}
              />
            </div>

            <div>
              <label className={labelCls}>Carrier</label>
              <div className="relative">
                <select
                  value={form.carrier}
                  onChange={(e) => patchForm({ carrier: e.target.value })}
                  className={`${inputCls} appearance-none pr-8`}
                >
                  <option value="">Select carrier…</option>
                  {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Current Location</label>
              <input
                className={inputCls}
                placeholder="e.g. Nairobi sorting center"
                value={form.currentLocation}
                onChange={(e) => patchForm({ currentLocation: e.target.value })}
              />
            </div>

            <div>
              <label className={labelCls}>Tracking Status</label>
              <div className="relative">
                <select
                  value={form.status}
                  onChange={(e) => patchForm({ status: e.target.value })}
                  className={`${inputCls} appearance-none pr-8`}
                >
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="in_transit">In Transit</option>
                  <option value="out_for_delivery">Out for Delivery</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed Delivery</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
