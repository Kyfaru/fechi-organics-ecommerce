"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ImageIcon, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? "";

interface Banner {
  id: string;
  name: string;
  location: string;
  imageKey: string;
  ctaText: string | null;
  ctaLink: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  createdAt: string;
}

type DrawerMode = "create" | "edit";

const EMPTY_FORM = {
  name: "",
  location: "homepage_hero",
  imageKey: "",
  ctaText: "",
  ctaLink: "",
  startDate: "",
  endDate: "",
  status: "active",
};

function imageUrl(key: string | null): string | null {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  return `${R2_BASE}/${key}`;
}

function toDateInput(value: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function AdminBannersClient() {
  const qc = useQueryClient();

  const [drawer, setDrawer] = useState<{ open: boolean; mode: DrawerMode; banner: Banner | null }>({
    open: false, mode: "create", banner: null,
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-banners"],
    queryFn: () => fetch("/api/admin/banners").then((r) => r.json()),
  });
  const banners: Banner[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to create banner");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Banner created");
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!drawer.banner) return;
      const res = await fetch(`/api/admin/banners/${drawer.banner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update banner");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Banner updated");
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/banners/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to delete banner");
    },
    onSuccess: () => {
      toast.success("Banner deleted");
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (b: Banner) => {
      const next = b.status === "active" ? "inactive" : "active";
      const res = await fetch(`/api/admin/banners/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update banner");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer({ open: true, mode: "create", banner: null });
  }

  function openEdit(b: Banner) {
    setForm({
      name: b.name,
      location: b.location,
      imageKey: b.imageKey,
      ctaText: b.ctaText ?? "",
      ctaLink: b.ctaLink ?? "",
      startDate: toDateInput(b.startDate),
      endDate: toDateInput(b.endDate),
      status: b.status,
    });
    setDrawer({ open: true, mode: "edit", banner: b });
  }

  function closeDrawer() {
    setDrawer({ open: false, mode: "create", banner: null });
  }

  function handleSubmit() {
    if (drawer.mode === "create") createMutation.mutate();
    else updateMutation.mutate();
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const columns = [
    {
      key: "name",
      label: "Banner",
      sortable: true,
      render: (v: unknown, row: Record<string, unknown>) => {
        const url = imageUrl((row.imageKey as string) ?? null);
        return (
          <div className="flex items-center gap-3">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="w-10 h-10 rounded-[6px] object-cover border border-(--neutral-200)" />
            ) : (
              <div className="w-10 h-10 rounded-[6px] bg-(--neutral-100) flex items-center justify-center">
                <ImageIcon size={16} className="text-(--neutral-400)" />
              </div>
            )}
            <span className="font-dm text-[14px] font-medium text-(--neutral-900)">{String(v)}</span>
          </div>
        );
      },
    },
    {
      key: "location",
      label: "Location",
      sortable: true,
      render: (v: unknown) => (
        <span className="inline-block px-2 py-0.5 rounded-full bg-(--neutral-100) font-dm text-[12px] text-(--neutral-700)">
          {String(v || "—").replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "ctaLink",
      label: "Link",
      render: (v: unknown) => (
        <span className="font-dm text-[13px] text-(--neutral-500) truncate max-w-[180px] inline-block">{String(v || "—")}</span>
      ),
    },
    {
      key: "status",
      label: "Active",
      render: (_: unknown, row: Record<string, unknown>) => {
        const b = row as unknown as Banner;
        return (
          <button onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(b); }} className="inline-flex">
            <StatusPill status={b.status === "active" ? "active" : "inactive"} />
          </button>
        );
      },
    },
    {
      key: "endDate",
      label: "Expires",
      render: (v: unknown) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">
          {v ? new Date(String(v)).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "id",
      label: "Actions",
      render: (_: unknown, row: Record<string, unknown>) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row as unknown as Banner); }}
            className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--neutral-100) hover:bg-(--neutral-200) text-(--neutral-700) transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row as unknown as Banner); }}
            className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--danger-bg) hover:bg-red-100 text-(--danger) transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        breadcrumbs={[{ label: "Content", href: "/admin/content/banners" }, { label: "Banners", href: "/admin/content/banners" }]}
        title="Banners"
        description="Manage promotional banners across the storefront"
        action={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
          >
            <Plus size={16} />
            Add Banner
          </button>
        }
      />

      <div className="px-6 pb-6">
        <DataTable
          columns={columns}
          data={banners as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No banners yet"
          emptyDescription="Add your first banner to get started."
          pageSize={20}
        />
      </div>

      <Drawer
        open={drawer.open}
        onClose={closeDrawer}
        title={drawer.mode === "create" ? "Add Banner" : "Edit Banner"}
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
              disabled={isPending || !form.name.trim() || !form.imageKey.trim()}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50 ml-auto"
            >
              {isPending ? "Saving..." : drawer.mode === "create" ? "Add Banner" : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Title" required>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Summer Sale Hero"
              className={inputCls}
            />
          </FormField>

          <FormField label="Image URL / Key" required>
            <input
              value={form.imageKey}
              onChange={(e) => setForm((f) => ({ ...f, imageKey: e.target.value }))}
              placeholder="banners/summer-hero.jpg"
              className={inputCls}
            />
          </FormField>

          {form.imageKey && (
            <div className="rounded-[8px] border border-(--neutral-200) overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(form.imageKey) ?? ""} alt="Preview" className="w-full h-32 object-cover" />
            </div>
          )}

          <FormField label="Location">
            <div className="relative">
              <select
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="homepage_hero">Homepage Hero</option>
                <option value="homepage_strip">Homepage Strip</option>
                <option value="shop_top">Shop Top</option>
                <option value="cart">Cart</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="CTA Text">
              <input
                value={form.ctaText}
                onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
                placeholder="Shop Now"
                className={inputCls}
              />
            </FormField>
            <FormField label="CTA Link">
              <input
                value={form.ctaLink}
                onChange={(e) => setForm((f) => ({ ...f, ctaLink: e.target.value }))}
                placeholder="/shop"
                className={inputCls}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Starts">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className={inputCls}
              />
            </FormField>
            <FormField label="Expires">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className={inputCls}
              />
            </FormField>
          </div>

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
        </div>
      </Drawer>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        title="Delete Banner"
        description={`This will permanently delete "${deleteTarget?.name}".`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

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
