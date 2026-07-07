"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Mail,
  MessageSquare,
  Bell,
  Send,
  ChevronDown,
  Trash2,
  Phone,
  PencilLine,
  Megaphone,
  Zap,
  Clock,
  Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatsCard } from "@/components/ui/stats-card";
import { DataTable } from "@/components/admin/ui/DataTable";
import RichTextEditor from "@/components/admin/ui/RichTextEditor";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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

  // Send-options modal state — lets an admin pick Send Now / Schedule / Send Later per campaign
  const [sendTarget, setSendTarget] = useState<Campaign | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");

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
  // mode "now" sends immediately, "schedule" waits for an exact datetime the
  // admin picks, "later" queues a short fixed-delay batch send in the background
  type SendPayload = {
    id: string;
    mode: "now" | "schedule" | "later";
    scheduledAt?: string;
  };

  const SEND_SUCCESS_MESSAGE: Record<SendPayload["mode"], string> = {
    now: "Campaign is sending now",
    schedule: "Campaign scheduled",
    later: "Campaign queued — it will go out shortly",
  };

  const sendMutation = useMutation({
    mutationFn: async ({ id, mode, scheduledAt }: SendPayload) => {
      const res = await fetch(`/api/admin/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, scheduledAt }),
      });
      const json = await res.json();
      if (!json.ok)
        throw new Error(json.error?.message ?? "Failed to send campaign");
      return json.data;
    },
    onSuccess: (_data, variables) => {
      toast.success(SEND_SUCCESS_MESSAGE[variables.mode]);
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      setSendTarget(null);
      setScheduleAt("");
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
                  setScheduleAt("");
                  setSendTarget(c);
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
          <StatsCard title="Total Campaigns" value={String(stats.total)} icon={<Megaphone className="h-4 w-4 text-muted-foreground" />} change="Healthy" changeType="positive" />
          <StatsCard title="Sent This Month" value={String(stats.sentThisMonth)} icon={<Send className="h-4 w-4 text-muted-foreground" />} change="—" changeType="negative" />
          <StatsCard title="Drafts" value={String(stats.drafts)} icon={<PencilLine className="h-4 w-4 text-muted-foreground" />} change="—" changeType="negative" />
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
                <RichTextEditor
                  value={form.content}
                  onChange={(content) => setForm((f) => ({ ...f, content }))}
                />
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

      {/* Send options — Send Now / Schedule / Send Later */}
      <AnimatePresence>
        {sendTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/45 z-50"
              onClick={() => setSendTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[440px] bg-white dark:bg-(--dark-surface) rounded-[12px] shadow-(--e3) z-50 p-6"
            >
              <h3 className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">
                Send &quot;{sendTarget.name}&quot;
              </h3>
              <p className="font-dm text-[14px] text-(--neutral-500) dark:text-(--dark-muted) mb-5">
                Choose when this campaign should go out.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() =>
                    sendMutation.mutate({ id: sendTarget.id, mode: "now" })
                  }
                  disabled={sendMutation.isPending}
                  className="w-full flex items-center gap-3 p-3 rounded-[8px] border border-(--neutral-200) hover:border-(--green-800) hover:bg-(--green-50) transition-colors text-left disabled:opacity-50"
                >
                  <Send size={16} className="text-(--green-800) shrink-0" />
                  <div>
                    <div className="font-dm text-[14px] font-medium text-(--neutral-900)">
                      Send Now
                    </div>
                    <div className="font-dm text-[12px] text-(--neutral-500)">
                      Delivers immediately
                    </div>
                  </div>
                </button>

                <button
                  onClick={() =>
                    sendMutation.mutate({ id: sendTarget.id, mode: "later" })
                  }
                  disabled={sendMutation.isPending}
                  className="w-full flex items-center gap-3 p-3 rounded-[8px] border border-(--neutral-200) hover:border-(--green-800) hover:bg-(--green-50) transition-colors text-left disabled:opacity-50"
                >
                  <Clock size={16} className="text-(--green-800) shrink-0" />
                  <div>
                    <div className="font-dm text-[14px] font-medium text-(--neutral-900)">
                      Send Later
                    </div>
                    <div className="font-dm text-[12px] text-(--neutral-500)">
                      Queues a short delayed batch send in the background
                    </div>
                  </div>
                </button>

                <div className="p-3 rounded-[8px] border border-(--neutral-200)">
                  <div className="flex items-center gap-3 mb-3">
                    <Calendar size={16} className="text-(--green-800) shrink-0" />
                    <div className="font-dm text-[14px] font-medium text-(--neutral-900)">
                      Schedule
                    </div>
                  </div>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className={inputCls}
                  />
                  <button
                    onClick={() =>
                      sendMutation.mutate({
                        id: sendTarget.id,
                        mode: "schedule",
                        scheduledAt: new Date(scheduleAt).toISOString(),
                      })
                    }
                    disabled={sendMutation.isPending || !scheduleAt}
                    className="mt-3 w-full h-10 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50"
                  >
                    Schedule Send
                  </button>
                </div>
              </div>

              <button
                onClick={() => setSendTarget(null)}
                className="mt-5 w-full h-10 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
