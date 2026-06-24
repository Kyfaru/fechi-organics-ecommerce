"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { toast } from "sonner";
import {
  Plus,
  Mail,
  MessageSquare,
  Bell,
  Send,
  ChevronDown,
  Trash2,
  Phone,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatCard } from "@/components/admin/ui/StatCard";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";
import MultiCustomerSelect, {
  type CustomerOption,
} from "@/components/ui/MultiCustomerSelect";

// ── Types ────────────────────────────────────────────────────────────────────

type CampaignType = "EMAIL" | "SMS" | "PUSH" | "WHATSAPP" | "ALL";

interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  audienceType: string;
  subject: string | null;
  heading: string | null;
  previewText: string | null;
  content: string | null;
  audienceCustomerIds: string[];
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED";
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  createdAt: string;
}

const TYPE_STYLES: Record<
  CampaignType,
  { bg: string; text: string; icon: React.ElementType }
> = {
  EMAIL: { bg: "bg-(--info)/10", text: "text-(--info)", icon: Mail },
  SMS: {
    bg: "bg-(--green-50)",
    text: "text-(--green-800)",
    icon: MessageSquare,
  },
  PUSH: { bg: "bg-(--gold-50)", text: "text-(--gold-700)", icon: Bell },
  WHATSAPP: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    icon: Phone,
  },
  ALL: { bg: "bg-purple-50", text: "text-purple-700", icon: Zap },
};

const AUDIENCE_LABELS: Record<string, string> = {
  ALL: "All Customers",
  NEW: "New Customers",
  CUSTOM: "Custom Selection",
};

// ── Component ────────────────────────────────────────────────────────────────

export function AdminCampaignsClient() {
  const qc = useQueryClient();

  // Drawer state — step 1 selects type, step 2 fills details
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<CampaignType | null>(null);
  const [sendMode, setSendMode] = useState<"now" | "later">("now");
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const [form, setForm] = useState({
    name: "",
    heading: "",
    audienceType: "ALL",
    subject: "",
    previewText: "",
    content: "",
    audienceCustomerIds: [] as string[],
    scheduledAt: "",
  });

  // ── Tiptap editor (only active for EMAIL / ALL types) ─────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: form.content ?? "",
    onUpdate: ({ editor }) =>
      setForm((f) => ({ ...f, content: editor.getHTML() })),
    editable: true,
  });

  // ── Fetch campaigns ────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () =>
      fetch("/api/admin/campaigns").then((r) => r.json()),
  });

  const campaigns: Campaign[] = data?.data?.campaigns ?? [];
  const stats = data?.data?.stats ?? {
    total: 0,
    sentThisMonth: 0,
    drafts: 0,
  };

  // ── Fetch customers for MultiCustomerSelect ────────────────────────────────
  const { data: customersData = [] } = useQuery<CustomerOption[]>({
    queryKey: ["admin-customers-simple"],
    queryFn: () =>
      fetch("/api/admin/customers").then((r) =>
        r.json().then((j) =>
          (j?.data?.users ?? []).map(
            (u: { id: string; name: string; email: string; image?: string }) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              image: u.image,
            })
          )
        )
      ),
    enabled: drawerOpen,
  });

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
          heading: form.heading || undefined,
          subject: form.subject || undefined,
          previewText: form.previewText || undefined,
          content: form.content || undefined,
          audienceCustomerIds:
            form.audienceType === "CUSTOM"
              ? form.audienceCustomerIds
              : [],
          status,
          scheduledAt:
            status === "SCHEDULED" ? form.scheduledAt || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok)
        throw new Error(json.error?.message ?? "Failed to create campaign");
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
      const res = await fetch(`/api/admin/campaigns/${id}/send`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok)
        throw new Error(json.error?.message ?? "Failed to send campaign");
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
      const res = await fetch(`/api/admin/campaigns/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok)
        throw new Error(json.error?.message ?? "Failed to delete");
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
    setForm({
      name: "",
      heading: "",
      audienceType: "ALL",
      subject: "",
      previewText: "",
      content: "",
      audienceCustomerIds: [],
      scheduledAt: "",
    });
    setSendMode("now");
    // Reset Tiptap editor content
    editor?.commands.setContent("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  // Whether the current type uses email sending
  const isEmailType =
    selectedType === "EMAIL" || selectedType === "ALL";
  // Whether the current type uses SMS sending
  const isSmsType =
    selectedType === "SMS" || selectedType === "ALL";

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
            <div
              className={`w-8 h-8 rounded-[6px] flex items-center justify-center ${t?.bg}`}
            >
              <Icon size={14} className={t?.text} />
            </div>
            <span className="font-dm text-[14px] font-medium text-(--neutral-900)">
              {String(v)}
            </span>
          </div>
        );
      },
    },
    {
      key: "type",
      label: "Type",
      render: (v: unknown) => {
        const t = TYPE_STYLES[v as CampaignType];
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full font-dm text-[12px] font-medium ${t?.bg} ${t?.text}`}
          >
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
      render: (v: unknown) => (
        <StatusPill status={String(v).toLowerCase()} />
      ),
    },
    {
      key: "sentCount",
      label: "Sent",
      sortable: true,
      render: (v: unknown) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">
          {Number(v).toLocaleString()}
        </span>
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
                onClick={(e) => {
                  e.stopPropagation();
                  sendMutation.mutate(c.id);
                }}
                className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--green-50) text-(--green-800) hover:bg-(--green-200) transition-colors flex items-center gap-1.5"
              >
                <Send size={12} /> Send
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(c);
              }}
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
        description="Email, SMS, WhatsApp, and push notification campaigns"
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
          <StatCard
            eyebrow="Total Campaigns"
            value={String(stats.total)}
            icon={Mail}
          />
          <StatCard
            eyebrow="Sent This Month"
            value={String(stats.sentThisMonth)}
            icon={Send}
          />
          <StatCard eyebrow="Drafts" value={String(stats.drafts)} />
        </div>

        <DataTable
          columns={columns}
          data={campaigns as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No campaigns yet"
          emptyDescription="Create your first email, SMS, WhatsApp, or push campaign."
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
                  onClick={() =>
                    createMutation.mutate(
                      sendMode === "later" ? "SCHEDULED" : "DRAFT"
                    )
                  }
                  disabled={
                    createMutation.isPending || !form.name.trim()
                  }
                  className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending
                    ? "Saving..."
                    : sendMode === "later"
                    ? "Schedule"
                    : "Save"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={closeDrawer}
                className="h-10 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              >
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
            <p className="font-dm text-[14px] text-(--neutral-500) mb-4">
              Choose the type of campaign you want to send.
            </p>
            {(
              [
                "EMAIL",
                "SMS",
                "WHATSAPP",
                "ALL",
                "PUSH",
              ] as CampaignType[]
            ).map((type) => {
              const t = TYPE_STYLES[type];
              const Icon = t.icon;
              const labels: Record<
                CampaignType,
                { title: string; desc: string }
              > = {
                EMAIL: {
                  title: "Email Campaign",
                  desc: "Reach customers via email with rich content and HTML support",
                },
                SMS: {
                  title: "SMS Campaign",
                  desc: "Send short text messages directly to customer phones",
                },
                PUSH: {
                  title: "Push Notification",
                  desc: "Engage users with in-app push notifications",
                },
                WHATSAPP: {
                  title: "WhatsApp Campaign",
                  desc: "Send messages via WhatsApp to customers with opted-in numbers",
                },
                ALL: {
                  title: "All Channels",
                  desc: "Simultaneously send via Email + SMS to maximise reach",
                },
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
                  <div
                    className={`w-12 h-12 rounded-[10px] flex items-center justify-center shrink-0 ${t.bg}`}
                  >
                    <Icon size={22} className={t.text} />
                  </div>
                  <div>
                    <div className="font-syne text-[15px] font-semibold text-(--neutral-900)">
                      {labels[type].title}
                    </div>
                    <div className="font-dm text-[13px] text-(--neutral-500) mt-0.5">
                      {labels[type].desc}
                    </div>
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
            {/* Campaign name */}
            <Field label="Campaign Name" required>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. August Newsletter"
                className={inputCls}
              />
            </Field>

            {/* Heading — always shown */}
            <Field label="Heading" required>
              <input
                value={form.heading}
                onChange={(e) =>
                  setForm((f) => ({ ...f, heading: e.target.value }))
                }
                placeholder="e.g. Big Summer Sale — 20% Off Everything"
                className={inputCls}
              />
            </Field>

            {/* Audience */}
            <Field label="Audience">
              <div className="relative">
                <select
                  value={form.audienceType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      audienceType: e.target.value,
                      // Reset custom list when switching away from CUSTOM
                      audienceCustomerIds:
                        e.target.value !== "CUSTOM"
                          ? []
                          : f.audienceCustomerIds,
                    }))
                  }
                  className={`${inputCls} appearance-none pr-8`}
                >
                  <option value="ALL">All Customers</option>
                  <option value="NEW">New Customers</option>
                  <option value="CUSTOM">Custom Selection</option>
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none"
                />
              </div>
            </Field>

            {/* Custom audience picker */}
            {form.audienceType === "CUSTOM" && (
              <Field label="Select Customers">
                <MultiCustomerSelect
                  customers={customersData}
                  value={form.audienceCustomerIds}
                  onChange={(ids) =>
                    setForm((f) => ({ ...f, audienceCustomerIds: ids }))
                  }
                  placeholder="Search and select customers..."
                />
              </Field>
            )}

            {/* Subject + previewText — only for email-capable types */}
            {isEmailType && (
              <>
                <Field label="Subject Line" required>
                  <input
                    value={form.subject}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, subject: e.target.value }))
                    }
                    placeholder="Your email subject..."
                    className={inputCls}
                  />
                </Field>
                <Field label="Preview Text">
                  <input
                    value={form.previewText}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        previewText: e.target.value,
                      }))
                    }
                    placeholder="Short preview shown in inbox..."
                    className={inputCls}
                  />
                </Field>
              </>
            )}

            {/* Content — Tiptap for email types, plain textarea for SMS/PUSH/WHATSAPP */}
            {isEmailType ? (
              <Field label="Content" hint="Rich text — formatting preserved in email">
                <div className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                  {/* Toolbar */}
                  <div className="sticky top-0 bg-white dark:bg-neutral-800 flex align-middle gap-x-0.5 border-b border-gray-200 dark:border-neutral-700 p-2">
                    {/* Bold */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor?.chain().focus().toggleBold().run();
                      }}
                      className={`size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 ${editor?.isActive("bold") ? "bg-gray-100 dark:bg-neutral-700" : ""}`}
                    >
                      <svg
                        className="shrink-0 size-4"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 12a4 4 0 0 0 0-8H6v8" />
                        <path d="M15 20a4 4 0 0 0 0-8H6v8Z" />
                      </svg>
                    </button>
                    {/* Italic */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor?.chain().focus().toggleItalic().run();
                      }}
                      className={`size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 ${editor?.isActive("italic") ? "bg-gray-100 dark:bg-neutral-700" : ""}`}
                    >
                      <svg
                        className="shrink-0 size-4"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="19" x2="10" y1="4" y2="4" />
                        <line x1="14" x2="5" y1="20" y2="20" />
                        <line x1="15" x2="9" y1="4" y2="20" />
                      </svg>
                    </button>
                    {/* Underline */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor?.chain().focus().toggleUnderline().run();
                      }}
                      className={`size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 ${editor?.isActive("underline") ? "bg-gray-100 dark:bg-neutral-700" : ""}`}
                    >
                      <svg
                        className="shrink-0 size-4"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 4v6a6 6 0 0 0 12 0V4" />
                        <line x1="4" x2="20" y1="20" y2="20" />
                      </svg>
                    </button>
                    {/* Strike */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor?.chain().focus().toggleStrike().run();
                      }}
                      className={`size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 ${editor?.isActive("strike") ? "bg-gray-100 dark:bg-neutral-700" : ""}`}
                    >
                      <svg
                        className="shrink-0 size-4"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                        <path d="M14 12a4 4 0 0 1 0 8H6" />
                        <line x1="4" x2="20" y1="12" y2="12" />
                      </svg>
                    </button>
                    {/* Ordered list */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor?.chain().focus().toggleOrderedList().run();
                      }}
                      className={`size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 ${editor?.isActive("orderedList") ? "bg-gray-100 dark:bg-neutral-700" : ""}`}
                    >
                      <svg
                        className="shrink-0 size-4"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="10" x2="21" y1="6" y2="6" />
                        <line x1="10" x2="21" y1="12" y2="12" />
                        <line x1="10" x2="21" y1="18" y2="18" />
                        <path d="M4 6h1v4" />
                        <path d="M4 10h2" />
                        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
                      </svg>
                    </button>
                    {/* Bullet list */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor?.chain().focus().toggleBulletList().run();
                      }}
                      className={`size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 ${editor?.isActive("bulletList") ? "bg-gray-100 dark:bg-neutral-700" : ""}`}
                    >
                      <svg
                        className="shrink-0 size-4"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="8" x2="21" y1="6" y2="6" />
                        <line x1="8" x2="21" y1="12" y2="12" />
                        <line x1="8" x2="21" y1="18" y2="18" />
                        <line x1="3" x2="3.01" y1="6" y2="6" />
                        <line x1="3" x2="3.01" y1="12" y2="12" />
                        <line x1="3" x2="3.01" y1="18" y2="18" />
                      </svg>
                    </button>
                    {/* Blockquote */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor?.chain().focus().toggleBlockquote().run();
                      }}
                      className={`size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 ${editor?.isActive("blockquote") ? "bg-gray-100 dark:bg-neutral-700" : ""}`}
                    >
                      <svg
                        className="shrink-0 size-4"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 6H3" />
                        <path d="M21 12H8" />
                        <path d="M21 18H8" />
                        <path d="M3 12v6" />
                      </svg>
                    </button>
                  </div>
                  <EditorContent
                    editor={editor}
                    className="h-40 overflow-auto p-3 prose dark:prose-invert max-w-none text-sm"
                  />
                </div>
              </Field>
            ) : (
              <Field
                label="Content"
                hint={
                  isSmsType ? "Plain text only — no HTML" : undefined
                }
              >
                <textarea
                  value={form.content}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, content: e.target.value }))
                  }
                  rows={8}
                  placeholder="Message content..."
                  className={`${inputCls} resize-y min-h-[160px] h-auto`}
                />
                {/* SMS character counter */}
                {isSmsType && (
                  <p className="mt-1 font-dm text-[12px] text-(--neutral-400)">
                    {form.content.length} / 160 chars (
                    {Math.ceil(form.content.length / 160) || 1} SMS)
                  </p>
                )}
              </Field>
            )}

            {/* Schedule */}
            <div>
              <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-2">
                Send Timing
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sendMode"
                    checked={sendMode === "now"}
                    onChange={() => setSendMode("now")}
                    className="accent-(--green-800)"
                  />
                  <span className="font-dm text-[14px] text-(--neutral-700)">
                    Save now (send manually later)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sendMode"
                    checked={sendMode === "later"}
                    onChange={() => setSendMode("later")}
                    className="accent-(--green-800)"
                  />
                  <span className="font-dm text-[14px] text-(--neutral-700)">
                    Schedule for later
                  </span>
                </label>
                {sendMode === "later" && (
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, scheduledAt: e.target.value }))
                    }
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
        onConfirm={() =>
          deleteTarget && deleteMutation.mutate(deleteTarget.id)
        }
        loading={deleteMutation.isPending}
        title="Delete Campaign"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">
        {label}{" "}
        {required && <span className="text-(--danger)">*</span>}
        {hint && (
          <span className="text-(--neutral-400) font-normal ml-1">
            ({hint})
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow";
