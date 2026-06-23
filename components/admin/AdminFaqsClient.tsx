"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, HelpCircle, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";

interface Faq {
  id: string;
  question: string;
  answer: string;
  group: string;
  order: number;
  status: string;
  createdAt: string;
}

type DrawerMode = "create" | "edit";

const EMPTY_FORM = {
  question: "",
  answer: "",
  group: "General",
  order: 0,
  status: "published",
};

export function AdminFaqsClient() {
  const qc = useQueryClient();

  const [drawer, setDrawer] = useState<{ open: boolean; mode: DrawerMode; faq: Faq | null }>({
    open: false, mode: "create", faq: null,
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Faq | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-faqs"],
    queryFn: () => fetch("/api/admin/faqs").then((r) => r.json()),
  });
  const faqs: Faq[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to create FAQ");
      return json.data;
    },
    onSuccess: () => {
      toast.success("FAQ created");
      qc.invalidateQueries({ queryKey: ["admin-faqs"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!drawer.faq) return;
      const res = await fetch(`/api/admin/faqs/${drawer.faq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update FAQ");
      return json.data;
    },
    onSuccess: () => {
      toast.success("FAQ updated");
      qc.invalidateQueries({ queryKey: ["admin-faqs"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/faqs/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to delete FAQ");
    },
    onSuccess: () => {
      toast.success("FAQ deleted");
      qc.invalidateQueries({ queryKey: ["admin-faqs"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (faq: Faq) => {
      const next = faq.status === "published" ? "draft" : "published";
      const res = await fetch(`/api/admin/faqs/${faq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update FAQ");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-faqs"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer({ open: true, mode: "create", faq: null });
  }

  function openEdit(f: Faq) {
    setForm({ question: f.question, answer: f.answer, group: f.group, order: f.order, status: f.status });
    setDrawer({ open: true, mode: "edit", faq: f });
  }

  function closeDrawer() {
    setDrawer({ open: false, mode: "create", faq: null });
  }

  function handleSubmit() {
    if (drawer.mode === "create") createMutation.mutate();
    else updateMutation.mutate();
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const columns = [
    {
      key: "question",
      label: "Question",
      sortable: true,
      render: (v: unknown) => (
        <div className="flex items-center gap-2 max-w-[420px]">
          <div className="w-8 h-8 rounded-full bg-(--gold-50) flex items-center justify-center shrink-0">
            <HelpCircle size={14} className="text-(--gold-700)" />
          </div>
          <span className="font-dm text-[14px] font-medium text-(--neutral-900) truncate">{String(v)}</span>
        </div>
      ),
    },
    {
      key: "group",
      label: "Category",
      sortable: true,
      render: (v: unknown) => (
        <span className="inline-block px-2 py-0.5 rounded-full bg-(--neutral-100) font-dm text-[12px] text-(--neutral-700)">{String(v || "—")}</span>
      ),
    },
    {
      key: "status",
      label: "Published",
      render: (_: unknown, row: Record<string, unknown>) => {
        const f = row as unknown as Faq;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(f); }}
            className="inline-flex"
          >
            <StatusPill status={f.status} />
          </button>
        );
      },
    },
    {
      key: "order",
      label: "Sort Order",
      sortable: true,
      render: (v: unknown) => <span className="font-dm text-[14px] text-(--neutral-700)">{String(v ?? 0)}</span>,
    },
    {
      key: "id",
      label: "Actions",
      render: (_: unknown, row: Record<string, unknown>) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row as unknown as Faq); }}
            className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--neutral-100) hover:bg-(--neutral-200) text-(--neutral-700) transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row as unknown as Faq); }}
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
        breadcrumbs={[{ label: "Content", href: "/admin/content/faqs" }, { label: "FAQs", href: "/admin/content/faqs" }]}
        title="FAQs"
        description="Manage frequently asked questions"
        action={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
          >
            <Plus size={16} />
            Add FAQ
          </button>
        }
      />

      <div className="px-6 pb-6">
        <DataTable
          columns={columns}
          data={faqs as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No FAQs yet"
          emptyDescription="Add your first FAQ to get started."
          pageSize={20}
        />
      </div>

      <Drawer
        open={drawer.open}
        onClose={closeDrawer}
        title={drawer.mode === "create" ? "Add FAQ" : "Edit FAQ"}
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
              disabled={isPending || !form.question.trim() || !form.answer.trim()}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50 ml-auto"
            >
              {isPending ? "Saving..." : drawer.mode === "create" ? "Add FAQ" : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Question" required>
            <input
              value={form.question}
              onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
              placeholder="e.g. How long does delivery take?"
              className={inputCls}
            />
          </FormField>

          <FormField label="Answer" required>
            <textarea
              value={form.answer}
              onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
              rows={5}
              placeholder="Write the answer..."
              className={`${inputCls} h-auto py-2 resize-none`}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category">
              <input
                value={form.group}
                onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
                placeholder="General"
                className={inputCls}
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
          </div>

          <FormField label="Status">
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
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
        title="Delete FAQ"
        description={`This will permanently delete "${deleteTarget?.question}".`}
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
