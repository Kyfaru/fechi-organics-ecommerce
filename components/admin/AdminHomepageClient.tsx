"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Drawer } from "@/components/admin/ui/Drawer";

interface HomepageSection {
  id: string;
  type: string;
  order: number;
  visible: boolean;
  config: Record<string, unknown>;
}

export function AdminHomepageClient() {
  const qc = useQueryClient();

  const [editing, setEditing] = useState<HomepageSection | null>(null);
  const [form, setForm] = useState({ title: "", subtitle: "", visible: true, order: 0 });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-homepage"],
    queryFn: () => fetch("/api/admin/homepage").then((r) => r.json()),
  });
  const sections: HomepageSection[] = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (next: HomepageSection[]) => {
      const res = await fetch("/api/admin/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to save sections");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Homepage updated");
      qc.invalidateQueries({ queryKey: ["admin-homepage"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function persist(updated: HomepageSection) {
    const next = sections.map((s) => (s.id === updated.id ? updated : s));
    saveMutation.mutate(next);
  }

  function toggleVisible(section: HomepageSection) {
    persist({ ...section, visible: !section.visible });
  }

  function openEdit(section: HomepageSection) {
    setForm({
      title: String(section.config?.title ?? ""),
      subtitle: String(section.config?.subtitle ?? ""),
      visible: section.visible,
      order: section.order,
    });
    setEditing(section);
  }

  function handleSave() {
    if (!editing) return;
    persist({
      ...editing,
      visible: form.visible,
      order: Number(form.order),
      config: { ...editing.config, title: form.title, subtitle: form.subtitle },
    });
  }

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        breadcrumbs={[{ label: "Content", href: "/admin/content/homepage" }, { label: "Homepage Builder", href: "/admin/content/homepage" }]}
        title="Homepage Builder"
        description="Configure the sections shown on your storefront homepage"
      />

      <div className="px-6 pb-6 space-y-3 max-w-[760px]">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[72px] w-full rounded-[12px] bg-(--neutral-100) dark:bg-(--dark-border) animate-pulse" />
          ))
        ) : sections.length === 0 ? (
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) p-8 text-center font-dm text-[14px] text-(--neutral-500)">
            No homepage sections configured yet.
          </div>
        ) : (
          sections.map((section) => (
            <div
              key={section.id}
              className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-4 flex items-center gap-4"
            >
              <GripVertical size={18} className="text-(--neutral-300) shrink-0 cursor-grab" />

              <span className="inline-block px-2 py-0.5 rounded-full bg-(--gold-50) font-dm text-[11px] font-medium uppercase tracking-wide text-(--gold-700) shrink-0">
                {section.type.replace(/_/g, " ")}
              </span>

              <div className="flex-1 min-w-0">
                <div className="font-dm text-[14px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">
                  {String(section.config?.title ?? section.type)}
                </div>
                {section.config?.subtitle ? (
                  <div className="font-dm text-[13px] text-(--neutral-500) truncate">
                    {String(section.config.subtitle)}
                  </div>
                ) : null}
              </div>

              <button
                onClick={() => toggleVisible(section)}
                disabled={saveMutation.isPending}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-[6px] font-dm text-[13px] transition-colors disabled:opacity-50 ${
                  section.visible
                    ? "bg-(--green-50) text-(--success)"
                    : "bg-(--neutral-100) text-(--neutral-500)"
                }`}
              >
                {section.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                {section.visible ? "Visible" : "Hidden"}
              </button>

              <button
                onClick={() => openEdit(section)}
                className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--neutral-100) hover:bg-(--neutral-200) text-(--neutral-700) transition-colors shrink-0"
              >
                Edit
              </button>
            </div>
          ))
        )}
      </div>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit Section${editing ? ` — ${editing.type.replace(/_/g, " ")}` : ""}`}
        width={480}
        footer={
          <>
            <button
              onClick={() => setEditing(null)}
              className="h-10 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50 ml-auto"
            >
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Title">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Section title"
              className={inputCls}
            />
          </FormField>

          <FormField label="Subtitle">
            <textarea
              value={form.subtitle}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              rows={3}
              placeholder="Section subtitle"
              className={`${inputCls} h-auto py-2 resize-none`}
            />
          </FormField>

          <FormField label="Sort Order">
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))}
              className={inputCls}
            />
          </FormField>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.visible}
              onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))}
              className="w-4 h-4 accent-(--green-800)"
            />
            <span className="font-dm text-[14px] text-(--neutral-700)">Visible on storefront</span>
          </label>
        </div>
      </Drawer>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow";
