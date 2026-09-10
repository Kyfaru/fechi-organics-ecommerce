"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Plus, ImagePlus, Tag, X, ChevronDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import Switch from "@/components/ui/Switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AdminCategory = {
  id: string;
  key: string;
  name: string;
  slug: string;
  imageKey: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  _count: { products: number };
};

type FormData = {
  key: string;
  name: string;
  slug: string;
  imageKey: string;
  isActive: boolean;
  sortOrder: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

function imageUrl(key: string): string | null {
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  if (!R2_BASE) return null;
  return `${R2_BASE.replace(/\/$/, "")}/${key}`;
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const VALID_KEYS = ["FACE_CARE", "BODY_CARE", "HAIR_CARE", "WELLNESS", "BABY_KIDS"] as const;

const inputCls =
  "w-full font-dm text-[14px] text-(--neutral-900) rounded-[8px] border border-(--neutral-200) bg-white px-3 py-2 focus:outline-none focus:border-(--green-800) transition-colors placeholder:text-(--neutral-400)";
const labelCls =
  "block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5";

function blankForm(): FormData {
  return { key: "", name: "", slug: "", imageKey: "", isActive: true, sortOrder: "0" };
}

// ---------------------------------------------------------------------------
// Image uploader for category
// ---------------------------------------------------------------------------
function CategoryImageUpload({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const src = imageUrl(value);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", "categories");
      const res = await fetch("/api/admin/upload?category=categories", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Upload failed"); return; }
      onChange(json.objectKey);
      toast.success("Image uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleChange} />
      <div className="w-16 h-16 rounded-[8px] border border-(--neutral-200) bg-(--neutral-50) overflow-hidden flex items-center justify-center shrink-0">
        {src
          ? <Image src={src} alt="Category" width={64} height={64} className="object-cover w-full h-full" />
          : <Tag size={24} className="text-(--neutral-300)" />
        }
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="h-8 px-3 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center gap-2 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Spinner size={14} /> : <ImagePlus size={14} />}
          {value ? "Replace image" : "Upload image"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex items-center gap-1 font-dm text-[12px] text-(--danger) hover:opacity-80 w-fit"
          >
            <X size={12} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminProductCategoriesClient() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [form, setForm] = useState<FormData>(blankForm());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Query ──
  const { data, isLoading } = useQuery<{ ok: boolean; data: { categories: AdminCategory[] } }>({
    queryKey: ["admin-categories"],
    queryFn: () => fetch("/api/admin/products/categories").then((r) => r.json()),
  });

  const categories = data?.data?.categories ?? [];

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/products/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error?.message ?? "Could not create category"); return; }
      toast.success("Category created");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      closeDrawer();
    },
    onError: () => toast.error("Could not create category"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/products/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error?.message ?? "Could not update category"); return; }
      toast.success("Category updated");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      closeDrawer();
    },
    onError: () => toast.error("Could not update category"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/products/categories/${id}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error?.message ?? "Could not delete category"); return; }
      toast.success("Category deleted");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("Could not delete category"),
  });

  // ── Drawer helpers ──
  function openCreate() {
    setEditing(null);
    setForm(blankForm());
    setDrawerOpen(true);
  }

  function openEdit(cat: AdminCategory) {
    setEditing(cat);
    setForm({
      key: cat.key,
      name: cat.name,
      slug: cat.slug,
      imageKey: cat.imageKey,
      isActive: cat.isActive,
      sortOrder: String(cat.sortOrder),
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setTimeout(() => setEditing(null), 250);
  }

  function patchForm(patch: Partial<FormData>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleNameChange(name: string) {
    patchForm({ name, slug: editing ? form.slug : slugify(name) });
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.slug.trim()) { toast.error("Slug is required"); return; }
    const body = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      imageKey: form.imageKey,
      isActive: form.isActive,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      ...(!editing ? { key: form.key } : {}),
    };

    if (!editing && !form.key) { toast.error("Category key is required"); return; }

    if (editing) {
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── Table columns ──
  const columns = [
    {
      key: "name",
      label: "Category",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const cat = row as unknown as AdminCategory;
        const src = imageUrl(cat.imageKey);
        return (
          <div className="flex items-center gap-3 py-1">
            <div className="w-8 h-8 rounded-[6px] bg-(--neutral-100) overflow-hidden shrink-0 flex items-center justify-center">
              {src
                ? <Image src={src} alt={cat.name} width={32} height={32} className="object-cover w-full h-full" />
                : <Tag size={14} className="text-(--neutral-300)" />
              }
            </div>
            <p className="font-dm text-[14px] font-medium text-(--neutral-900)">{cat.name}</p>
          </div>
        );
      },
    },
    { key: "slug", label: "Slug", render: (_: unknown, row: Record<string, unknown>) => {
      const cat = row as unknown as AdminCategory;
      return <span className="font-dm text-[13px] text-(--neutral-500) font-mono">{cat.slug}</span>;
    }},
    { key: "key", label: "Key", render: (_: unknown, row: Record<string, unknown>) => {
      const cat = row as unknown as AdminCategory;
      return <span className="font-dm text-[12px] text-(--neutral-400) font-mono">{cat.key}</span>;
    }},
    { key: "_count", label: "Products", render: (_: unknown, row: Record<string, unknown>) => {
      const cat = row as unknown as AdminCategory;
      return <span className="font-dm text-[14px] text-(--neutral-700)">{cat._count.products}</span>;
    }},
    { key: "sortOrder", label: "Order", sortable: true, render: (_: unknown, row: Record<string, unknown>) => {
      const cat = row as unknown as AdminCategory;
      return <span className="font-dm text-[14px] text-(--neutral-700)">{cat.sortOrder}</span>;
    }},
    {
      key: "isActive",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const cat = row as unknown as AdminCategory;
        return <StatusPill status={cat.isActive ? "active" : "draft"} />;
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const cat = row as unknown as AdminCategory;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => openEdit(cat)}
              className="h-8 px-3 rounded-[6px] font-dm text-[12px] text-(--neutral-700) border border-(--neutral-200) hover:bg-(--neutral-50) transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => setDeleteTarget(cat.id)}
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
      <Plus size={16} /> Add Category
    </button>
  );

  const drawerFooter = (
    <>
      <button
        type="button"
        onClick={closeDrawer}
        disabled={isPending}
        className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) disabled:opacity-50 mr-auto transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="h-9 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-2 transition-opacity"
      >
        {isPending && <Spinner size={14} />}
        {editing ? "Save Changes" : "Create Category"}
      </button>
    </>
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Categories"
        description="Manage product categories"
        breadcrumbs={[
          { label: "Products", href: "/admin/products" },
          { label: "Categories", href: "/admin/products/categories" },
        ]}
        action={addButton}
      />

      <div className="px-6">
        <DataTable
          columns={columns}
          data={categories as unknown as Record<string, unknown>[]}
          loading={isLoading}
          onRowClick={(row) => openEdit(row as unknown as AdminCategory)}
          emptyTitle="No categories yet"
          emptyDescription="Add your first product category to get started."
          pageSize={20}
        />
      </div>

      {/* Category Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit Category" : "Add Category"}
        width={480}
        footer={drawerFooter}
      >
        <div className="flex flex-col gap-5">
          {/* Image */}
          <div>
            <label className={labelCls}>Category Image</label>
            <CategoryImageUpload value={form.imageKey} onChange={(key) => patchForm({ imageKey: key })} />
          </div>

          {/* Key (only on create) */}
          {!editing && (
            <div>
              <label className={labelCls}>Category Key *</label>
              <div className="relative">
                <select
                  value={form.key}
                  onChange={(e) => patchForm({ key: e.target.value })}
                  className={`${inputCls} appearance-none pr-8`}
                >
                  <option value="">Select key…</option>
                  {VALID_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
              </div>
              <p className="font-dm text-[11px] text-(--neutral-400) mt-1">Must be unique. Cannot be changed after creation.</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className={labelCls}>Name *</label>
            <input
              className={inputCls}
              placeholder="e.g. Face Care"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          {/* Slug */}
          <div>
            <label className={labelCls}>Slug *</label>
            <input
              className={inputCls}
              placeholder="face-care"
              value={form.slug}
              onChange={(e) => patchForm({ slug: e.target.value })}
            />
            <p className="font-dm text-[11px] text-(--neutral-400) mt-1">Lowercase letters, numbers, hyphens only.</p>
          </div>

          {/* Sort order */}
          <div>
            <label className={labelCls}>Sort Order</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={form.sortOrder}
              onChange={(e) => patchForm({ sortOrder: e.target.value })}
            />
            <p className="font-dm text-[11px] text-(--neutral-400) mt-1">Lower numbers appear first.</p>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <Switch
              checked={form.isActive}
              onChange={(v) => patchForm({ isActive: v })}
            />
            <span className="font-dm text-[13px] text-(--neutral-700)">Active (visible in store)</span>
          </label>
        </div>
      </Drawer>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="Delete category?"
        description="This action cannot be undone. Categories with products cannot be deleted — reassign products first."
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
