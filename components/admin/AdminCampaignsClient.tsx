"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Mail, MessageSquare, Bell, Send, ChevronDown, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatCard } from "@/components/admin/ui/StatCard";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";

// ── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  type: "EMAIL" | "SMS" | "PUSH";
  audienceType: string;
  subject: string | null;
  content: string | null;
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED";
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  createdAt: string;
}

const TYPE_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  EMAIL: { bg: "bg-(--info)/10", text: "text-(--info)", icon: Mail },
  SMS: { bg: "bg-(--green-50)", text: "text-(--green-800)", icon: MessageSquare },
  PUSH: { bg: "bg-(--gold-50)", text: "text-(--gold-700)", icon: Bell },
};

const AUDIENCE_LABELS: Record<string, string> = {
  ALL: "All Customers",
  NEW: "New Customers",
  VIP: "VIP Customers",
};

// ── Component ────────────────────────────────────────────────────────────────

export function AdminCampaignsClient() {
  const qc = useQueryClient();

  // Drawer state — step 1 selects type, step 2 fills details
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<"EMAIL" | "SMS" | "PUSH" | null>(null);
  const [sendMode, setSendMode] = useState<"now" | "later">("now");
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const [form, setForm] = useState({
    name: "",
    audienceType: "ALL",
    subject: "",
    previewText: "",
    content: "",
    scheduledAt: "",
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => fetch("/api/admin/campaigns").then((r) => r.json()),
  });

  const campaigns: Campaign[] = data?.data?.campaigns ?? [];
  const stats = data?.data?.stats ?? { total: 0, sentThisMonth: 0, drafts: 0 };

  // ── Create campaign ────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "SCHEDULED") => {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: selectedType,
          audienceType: form.audienceType,
          subject: form.subject || undefined,
          content: form.content || undefined,
          status,
          scheduledAt: status === "SCHEDULED" ? form.scheduledAt || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to create campaign");
      return json.data;
    },
    onSuccess: (d: Campaign) => {
      toast.success(`Campaign "${d.name}" saved`);
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Send campaign ─────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/campaigns/${id}/send`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to send campaign");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Campaign queued for sending");
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Delete campaign ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/campaigns/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to delete");
    },
    onSuccess: () => {
      toast.success("Campaign deleted");
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openDrawer() {
    setStep(1);
    setSelectedType(null);
    setForm({ name: "", audienceType: "ALL", subject: "", previewText: "", content: "", scheduledAt: "" });
    setSendMode("now");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      key: "name",
      label: "Campaign",
      sortable: true,
      render: (v: unknown, row: Record<string, unknown>) => {
        const c = row as unknown as Campaign;
        const t = TYPE_STYLES[c.type];
        const Icon = t?.icon ?? Mail;
        return (
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-[6px] flex items-center justify-center ${t?.bg}`}>
              <Icon size={14} className={t?.text} />
            </div>
            <span className="font-dm text-[14px] font-medium text-(--neutral-900)">{String(v)}</span>
          </div>
        );
      },
    },
    {
      key: "type",
      label: "Type",
      render: (v: unknown) => {
        const t = TYPE_STYLES[String(v)];
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-dm text-[12px] font-medium ${t?.bg} ${t?.text}`}>
            {String(v)}
          </span>
        );
      },
    },
    {
      key: "audienceType",
      label: "Audience",
      render: (v: unknown) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">
          {AUDIENCE_LABELS[String(v)] ?? String(v)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (v: unknown) => <StatusPill status={String(v).toLowerCase()} />,
    },
    {
      key: "sentCount",
      label: "Sent",
      sortable: true,
      render: (v: unknown) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">{Number(v).toLocaleString()}</span>
      ),
    },
    {
      key: "scheduledAt",
      label: "Scheduled",
      render: (v: unknown) =>
        v ? (
          <span className="font-dm text-[14px] text-(--neutral-700)">
            {new Date(String(v)).toLocaleString()}
          </span>
        ) : (
          <span className="text-(--neutral-400)">—</span>
        ),
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      render: (v: unknown) => (
        <span className="font-dm text-[14px] text-(--neutral-500)">
          {new Date(String(v)).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "id",
      label: "Actions",
      render: (_: unknown, row: Record<string, unknown>) => {
        const c = row as unknown as Campaign;
        return (
          <div className="flex items-center gap-2">
            {(c.status === "DRAFT" || c.status === "SCHEDULED") && (
              <button
                onClick={(e) => { e.stopPropagation(); sendMutation.mutate(c.id); }}
                className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--green-50) text-(--green-800) hover:bg-(--green-200) transition-colors flex items-center gap-1.5"
              >
                <Send size={12} /> Send
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
              className="h-8 w-8 flex items-center justify-center rounded-[6px] text-(--neutral-400) hover:bg-(--danger-bg) hover:text-(--danger) transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        title="Campaigns"
        description="Email, SMS and push notification campaigns"
        action={
          <button
            onClick={openDrawer}
            className="flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
          >
            <Plus size={16} />
            Create Campaign
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard eyebrow="Total Campaigns" value={String(stats.total)} icon={Mail} />
          <StatCard eyebrow="Sent This Month" value={String(stats.sentThisMonth)} icon={Send} />
          <StatCard eyebrow="Drafts" value={String(stats.drafts)} />
        </div>

        <DataTable
          columns={columns}
          data={campaigns as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No campaigns yet"
          emptyDescription="Create your first email, SMS, or push campaign."
          pageSize={20}
        />
      </div>

      {/* Create Campaign Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Create Campaign"
        width={640}
        footer={
          step === 2 ? (
            <>
              <button
                onClick={() => setStep(1)}
                className="h-10 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              >
                Back
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => createMutation.mutate("DRAFT")}
                  disabled={createMutation.isPending}
                  className="h-10 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button
                  onClick={() => createMutation.mutate(sendMode === "later" ? "SCHEDULED" : "DRAFT")}
                  disabled={createMutation.isPending || !form.name.trim()}
                  className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? "Saving..." : sendMode === "later" ? "Schedule" : "Save"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={closeDrawer} className="h-10 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors">
                Cancel
              </button>
              <button
                onClick={() => selectedType && setStep(2)}
                disabled={!selectedType}
                className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50 ml-auto"
              >
                Continue
              </button>
            </>
          )
        }
      >
        {step === 1 ? (
          /* Step 1 — choose type */
          <div className="space-y-3">
            <p className="font-dm text-[14px] text-(--neutral-500) mb-4">Choose the type of campaign you want to send.</p>
            {(["EMAIL", "SMS", "PUSH"] as const).map((type) => {
              const t = TYPE_STYLES[type];
              const Icon = t.icon;
              const labels: Record<string, { title: string; desc: string }> = {
                EMAIL: { title: "Email Campaign", desc: "Reach customers via email with rich content and HTML support" },
                SMS: { title: "SMS Campaign", desc: "Send short text messages directly to customer phones" },
                PUSH: { title: "Push Notification", desc: "Engage users with in-app push notifications" },
              };
              const selected = selectedType === type;
              return (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`w-full flex items-center gap-4 p-4 rounded-[12px] border-2 text-left transition-all ${
                    selected
                      ? "border-(--green-800) bg-(--green-50)"
                      : "border-(--neutral-200) bg-white hover:border-(--neutral-300)"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-[10px] flex items-center justify-center shrink-0 ${t.bg}`}>
                    <Icon size={22} className={t.text} />
                  </div>
                  <div>
                    <div className="font-syne text-[15px] font-semibold text-(--neutral-900)">{labels[type].title}</div>
                    <div className="font-dm text-[13px] text-(--neutral-500) mt-0.5">{labels[type].desc}</div>
                  </div>
                  {selected && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-(--green-800) flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px]">✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          /* Step 2 — fill details */
          <div className="space-y-4">
            <Field label="Campaign Name" required>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. August Newsletter"
                className={inputCls}
              />
            </Field>

            <Field label="Audience">
              <div className="relative">
                <select
                  value={form.audienceType}
                  onChange={(e) => setForm((f) => ({ ...f, audienceType: e.target.value }))}
                  className={`${inputCls} appearance-none pr-8`}
                >
                  <option value="ALL">All Customers</option>
                  <option value="NEW">New Customers</option>
                  <option value="VIP">VIP Customers</option>
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
              </div>
            </Field>

            {selectedType === "EMAIL" && (
              <>
                <Field label="Subject Line" required>
                  <input
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="Your email subject..."
                    className={inputCls}
                  />
                </Field>
                <Field label="Preview Text">
                  <input
                    value={form.previewText}
                    onChange={(e) => setForm((f) => ({ ...f, previewText: e.target.value }))}
                    placeholder="Short preview shown in inbox..."
                    className={inputCls}
                  />
                </Field>
              </>
            )}

            <Field label="Content" hint={selectedType === "EMAIL" ? "HTML content supported" : undefined}>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={8}
                placeholder={
                  selectedType === "EMAIL"
                    ? "<h1>Hello {{name}}</h1>\n<p>Your email body here...</p>"
                    : "Message content..."
                }
                className={`${inputCls} resize-y min-h-[160px] h-auto`}
              />
            </Field>

            {/* Schedule */}
            <div>
              <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-2">Send Timing</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="sendMode" checked={sendMode === "now"} onChange={() => setSendMode("now")} className="accent-(--green-800)" />
                  <span className="font-dm text-[14px] text-(--neutral-700)">Save now (send manually later)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="sendMode" checked={sendMode === "later"} onChange={() => setSendMode("later")} className="accent-(--green-800)" />
                  <span className="font-dm text-[14px] text-(--neutral-700)">Schedule for later</span>
                </label>
                {sendMode === "later" && (
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                    className={`${inputCls} mt-1`}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        title="Delete Campaign"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function Field({ label, required, hint, children }: {
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
