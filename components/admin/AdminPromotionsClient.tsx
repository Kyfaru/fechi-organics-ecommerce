"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Tag, RefreshCw, ChevronDown, Trash2, Copy, Check } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import Link from "next/link";
import { MAX_COUPON_POINTS } from "@/lib/promotions/schema";

// ── Types ────────────────────────────────────────────────────────────────────

interface Promotion {
  id: string;
  name: string;
  type: string;
  value: number;
  code: string | null;
  minOrder: number | null;
  maxUses: number | null;
  maxUsesPerUser: number;
  usedCount: number;
  startDate: string | null;
  endDate: string | null;
  status: string;
  createdAt: string;
  maxDiscountKes: number | null;
  /** Null = store coupon. Set = a customer's own referral code. */
  ownerUserId: string | null;
  pointsAward: number;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  disabledAt: string | null;
  owner: { id: string; name: string; email: string; image: string | null } | null;
}

const TABS = [
  { key: "store" as const, label: "Store Coupons" },
  { key: "customer" as const, label: "Customer Coupons" },
];
type TabKey = (typeof TABS)[number]["key"];

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: "% Off",
  FIXED: "KES Off",
  FREE_SHIPPING: "Free Ship",
};

const TYPE_COLORS: Record<string, string> = {
  PERCENTAGE: "bg-(--green-50) text-(--green-800)",
  FIXED: "bg-(--gold-50) text-(--gold-700)",
  FREE_SHIPPING: "bg-(--info)/10 text-(--info)",
};

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Component ────────────────────────────────────────────────────────────────

export function AdminPromotionsClient() {
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("store");
  const [viewTarget, setViewTarget] = useState<Promotion | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyCode(id: string, code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  const EMPTY_FORM = {
    name: "",
    type: "PERCENTAGE",
    value: "",
    code: "",
    minOrder: "",
    maxUses: "",
    maxUsesPerUser: "1",
    maxDiscountKes: "",
    pointsAward: "0",
    startDate: "",
    endDate: "",
    status: "active",
  };
  const [form, setForm] = useState(EMPTY_FORM);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: () => fetch("/api/admin/promotions").then((r) => r.json()),
  });

  const allPromos: Promotion[] = data?.data ?? [];

  // Store coupons are staff-created; customer coupons are the referral codes
  // created automatically alongside each customer's loyalty account.
  const isCustomerTab = activeTab === "customer";
  const filtered = allPromos.filter((p) =>
    isCustomerTab ? p.ownerUserId !== null : p.ownerUserId === null,
  );

  // ── Create/Update ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        type: form.type,
        value: Number(form.value),
        code: form.code || null,
        minOrder: form.minOrder ? Number(form.minOrder) : null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        maxUsesPerUser: form.maxUsesPerUser === "" ? 1 : Number(form.maxUsesPerUser),
        maxDiscountKes: form.maxDiscountKes ? Number(form.maxDiscountKes) * 100 : null,
        pointsAward: form.pointsAward === "" ? 0 : Number(form.pointsAward),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        status: form.status,
      };

      const url = editTarget ? `/api/admin/promotions/${editTarget.id}` : "/api/admin/promotions";
      const method = editTarget ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to save promotion");
      return json.data;
    },
    onSuccess: (p: Promotion & { queued?: boolean }) => {
      // A queued approval returns 202 with { ok: true, data: { queued: true } },
      // so `json.ok` alone would report a coupon as saved that was never
      // written — and it then vanishes on the next refetch.
      if (p?.queued) {
        toast.info("Sent for approval — an admin must approve it before it goes live");
      } else {
        toast.success(`Promotion "${p.name}" ${editTarget ? "updated" : "created"}`);
      }
      qc.invalidateQueries({ queryKey: ["admin-promotions"] });
      closeDrawer();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/promotions/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to disable");
    },
    onSuccess: () => {
      // Soft delete — the row and its redemption history stay, so the record of
      // who used the coupon survives.
      toast.success("Coupon disabled");
      qc.invalidateQueries({ queryKey: ["admin-promotions"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  }

  function openEdit(p: Promotion) {
    setEditTarget(p);
    setForm({
      name: p.name,
      type: p.type,
      value: String(p.value),
      code: p.code ?? "",
      minOrder: p.minOrder ? String(p.minOrder) : "",
      maxUses: p.maxUses ? String(p.maxUses) : "",
      maxUsesPerUser: String(p.maxUsesPerUser ?? 1),
      maxDiscountKes: p.maxDiscountKes ? String(p.maxDiscountKes / 100) : "",
      pointsAward: String(p.pointsAward ?? 0),
      startDate: p.startDate ? p.startDate.slice(0, 10) : "",
      endDate: p.endDate ? p.endDate.slice(0, 10) : "",
      status: p.status,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditTarget(null);
  }

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (v: unknown) => (
        <span className="font-dm text-[14px] font-medium text-(--neutral-900)">{String(v)}</span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (v: unknown) => (
        <span className={`inline-block px-2 py-0.5 rounded-full font-dm text-[12px] font-medium ${TYPE_COLORS[String(v)] ?? "bg-(--neutral-100) text-(--neutral-700)"}`}>
          {TYPE_LABELS[String(v)] ?? String(v)}
        </span>
      ),
    },
    {
      key: "value",
      label: "Value",
      render: (v: unknown, row: Record<string, unknown>) => {
        const type = String(row.type);
        const val = Number(v);
        return (
          <span className="font-dm text-[14px] font-semibold text-(--neutral-900)">
            {type === "PERCENTAGE" ? `${val}%` : type === "FIXED" ? `KES ${val.toLocaleString()}` : "Free"}
          </span>
        );
      },
    },
    {
      key: "code",
      label: "Code",
      render: (v: unknown, row: Record<string, unknown>) =>
        v ? (
          <div className="flex items-center gap-1.5">
            <code className="px-2 py-0.5 rounded bg-(--neutral-100) font-dm text-[13px] font-semibold text-(--neutral-900) tracking-wider">
              {String(v)}
            </code>
            <button
              onClick={(e) => { e.stopPropagation(); copyCode(String(row.id), String(v)); }}
              className="h-6 w-6 flex items-center justify-center rounded-[4px] text-(--neutral-400) hover:bg-(--neutral-100) hover:text-(--neutral-700) transition-colors"
              title="Copy code"
            >
              {copiedId === String(row.id) ? <Check size={12} className="text-(--green-700)" /> : <Copy size={12} />}
            </button>
          </div>
        ) : (
          <span className="text-(--neutral-400) text-[14px]">—</span>
        ),
    },
    {
      key: "minOrder",
      label: "Min Order",
      render: (v: unknown) =>
        v ? (
          <span className="font-dm text-[14px] text-(--neutral-700)">KES {Number(v).toLocaleString()}</span>
        ) : (
          <span className="text-(--neutral-400)">—</span>
        ),
    },
    {
      key: "usedCount",
      label: "Uses",
      render: (v: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">
          {String(v)} / {String(row.maxUses ?? "∞")}
        </span>
      ),
    },
    {
      key: "startDate",
      label: "Start",
      render: (v: unknown) =>
        v ? new Date(String(v)).toLocaleDateString() : <span className="text-(--neutral-400)">—</span>,
    },
    {
      key: "endDate",
      label: "End",
      render: (v: unknown) =>
        v ? new Date(String(v)).toLocaleDateString() : <span className="text-(--neutral-400)">—</span>,
    },
    {
      key: "pointsAward",
      label: "Points",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as Promotion;
        if (!p.pointsAward) return <span className="text-(--neutral-400)">—</span>;
        return (
          <span className="font-dm text-[13px] text-(--neutral-900)">
            {p.pointsAward.toLocaleString()}
            {p.approvalStatus === "PENDING" && (
              <span className="ml-1.5 text-[11px] text-(--gold-700)">pending</span>
            )}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as Promotion;
        // A disabled coupon is dead at checkout regardless of `status`, so say so.
        return <StatusPill status={p.disabledAt ? "disabled" : p.status} />;
      },
    },
    {
      key: "id",
      label: "Actions",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as Promotion;
        return (
          <div className="flex items-center gap-2">
            {/* Customer coupons are a customer's own referral code — the terms
                belong to the programme, so they can be read and disabled but
                never edited. */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (p.ownerUserId) setViewTarget(p);
                else openEdit(p);
              }}
              className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--neutral-100) hover:bg-(--neutral-200) text-(--neutral-700) transition-colors"
            >
              {p.ownerUserId ? "View" : "Edit"}
            </button>
            {!p.disabledAt && (
              <button
                title="Disable this coupon"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                className="h-8 w-8 flex items-center justify-center rounded-[6px] text-(--neutral-400) hover:bg-(--danger-bg) hover:text-(--danger) transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const valueLabel = form.type === "PERCENTAGE" ? "%" : form.type === "FIXED" ? "KES" : "";

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        title="Promotions"
        description="Discount codes and promotional offers"
        breadcrumbs={[
          { label: "Marketing", href: "/admin/marketing" },
          { label: "Promotions", href: "/admin/marketing/promotions" },
        ]}
        action={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
          >
            <Plus size={16} />
            Create Promotion
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-(--neutral-100) p-1 rounded-[10px] w-fit">
          {TABS.map(({ key: tab, label }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-8 px-4 rounded-[8px] font-dm text-[13px] font-medium transition-colors ${
                activeTab === tab
                  ? "bg-white text-(--neutral-900) shadow-(--e1)"
                  : "text-(--neutral-500) hover:text-(--neutral-700)"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isCustomerTab && (
          <p className="font-dm text-[13px] text-(--neutral-500)">
            Each customer&apos;s personal referral code, created automatically with their account.
            These can be read and disabled, but not edited.
          </p>
        )}

        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No promotions yet"
          emptyDescription="Create your first promotion or coupon code."
          pageSize={20}
        />
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editTarget ? "Edit Promotion" : "Create Promotion"}
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
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim() || !form.value}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50 ml-auto"
            >
              {saveMutation.isPending ? "Saving..." : editTarget ? "Save Changes" : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldWrap label="Name" required>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Summer Sale 20%"
              className={inputCls}
            />
          </FieldWrap>

          <FieldWrap label="Type">
            <div className="relative">
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="PERCENTAGE">Percentage Off</option>
                <option value="FIXED">Fixed Amount Off</option>
                <option value="FREE_SHIPPING">Free Shipping</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          </FieldWrap>

          {form.type !== "FREE_SHIPPING" && (
            <FieldWrap label={`Value (${valueLabel})`} required>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={form.type === "PERCENTAGE" ? "20" : "500"}
                  className={`${inputCls} pr-12`}
                />
                {valueLabel && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-dm text-[13px] text-(--neutral-400)">
                    {valueLabel}
                  </span>
                )}
              </div>
            </FieldWrap>
          )}

          <FieldWrap label="Coupon Code" hint="Leave blank for automatic promotions">
            <div className="flex gap-2">
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="SAVE20 (optional)"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                className="h-10 px-3 rounded-[8px] border border-(--neutral-200) text-(--neutral-500) hover:bg-(--neutral-100) transition-colors flex items-center gap-1.5 font-dm text-[13px]"
                title="Generate code"
              >
                <RefreshCw size={13} />
                Generate
              </button>
            </div>
          </FieldWrap>

          <div className="grid grid-cols-3 gap-3">
            <FieldWrap label="Min Order (KES)">
              <input
                type="number"
                min={0}
                value={form.minOrder}
                onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))}
                placeholder="e.g. 2000"
                className={inputCls}
              />
            </FieldWrap>
            <FieldWrap label="Max Uses">
              <input
                type="number"
                min={0}
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                placeholder="Unlimited"
                className={inputCls}
              />
            </FieldWrap>
            <FieldWrap label="Max Uses Per User">
              <input
                type="number"
                min={0}
                value={form.maxUsesPerUser}
                onChange={(e) => setForm((f) => ({ ...f, maxUsesPerUser: e.target.value }))}
                placeholder="1 (0 = unlimited)"
                className={inputCls}
              />
            </FieldWrap>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Max Discount (KES)">
              <input
                type="number"
                min={0}
                value={form.maxDiscountKes}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscountKes: e.target.value }))}
                placeholder="Uncapped"
                className={inputCls}
              />
            </FieldWrap>
            <FieldWrap label={`Points Awarded (max ${MAX_COUPON_POINTS.toLocaleString()})`}>
              <input
                type="number"
                min={0}
                max={MAX_COUPON_POINTS}
                value={form.pointsAward}
                onChange={(e) => setForm((f) => ({ ...f, pointsAward: e.target.value }))}
                placeholder="0"
                className={inputCls}
              />
            </FieldWrap>
          </div>

          {Number(form.pointsAward) > 0 && (
            <p className="rounded-[8px] bg-(--gold-50) border border-(--gold-200) px-3 py-2 font-dm text-[12px] text-(--gold-700)">
              A coupon that carries points needs approval from an admin or super admin before it
              works at checkout. The customer is credited when their order is paid.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Start Date">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className={inputCls}
              />
            </FieldWrap>
            <FieldWrap label="End Date">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className={inputCls}
              />
            </FieldWrap>
          </div>

          <FieldWrap label="Status">
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          </FieldWrap>
        </div>
      </Drawer>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        title="Disable Coupon"
        description={`Disable "${deleteTarget?.name}"? It stops working at checkout immediately. Its redemption history is kept.`}
        confirmLabel="Disable"
        danger
      />

      <CouponViewDrawer coupon={viewTarget} onClose={() => setViewTarget(null)} />
    </div>
  );
}

/**
 * Read-only view of a customer coupon, plus who has redeemed it.
 *
 * No footer — omitting it is the view-only Drawer pattern. Clicking a redeemer
 * deep-links to their customer drawer.
 */
function CouponViewDrawer({
  coupon,
  onClose,
}: {
  coupon: Promotion | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-promotion-redemptions", coupon?.id],
    enabled: !!coupon,
    queryFn: async () => {
      const res = await fetch(`/api/admin/promotions/${coupon!.id}/redemptions`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load redemptions");
      return json.data as {
        redemptions: Array<{
          id: string;
          orderId: string;
          redeemedAt: string;
          customer: { id: string; name: string | null; email: string | null; image: string | null };
        }>;
      };
    },
  });

  const facts = coupon
    ? [
        { label: "Owner", value: coupon.owner?.name ?? coupon.ownerUserId ?? "—" },
        { label: "Code", value: coupon.code ?? "—" },
        {
          label: "Discount",
          value: coupon.type === "PERCENTAGE" ? `${coupon.value}%` : `KES ${coupon.value}`,
        },
        { label: "Used", value: `${coupon.usedCount} / ${coupon.maxUses ?? "∞"}` },
        { label: "Points carried", value: coupon.pointsAward ? coupon.pointsAward.toLocaleString() : "None" },
        { label: "Status", value: coupon.disabledAt ? "Disabled" : coupon.status },
      ]
    : [];

  return (
    <Drawer open={!!coupon} onClose={onClose} title={coupon?.code ?? "Coupon"} width={640}>
      {!coupon ? null : (
        <div className="space-y-5">
          <p className="rounded-[8px] bg-(--neutral-50) border border-(--neutral-200) px-3 py-2 font-dm text-[12px] text-(--neutral-600)">
            This is a customer&apos;s own referral code. Its terms are set by the loyalty programme
            and can&apos;t be edited here — disable it if there&apos;s a problem.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {facts.map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-(--neutral-200) p-3">
                <p className="font-dm text-[11px] uppercase tracking-wider text-(--neutral-500)">
                  {label}
                </p>
                <p className="font-syne text-[16px] font-semibold text-(--neutral-900)">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="font-syne text-[14px] font-semibold text-(--neutral-900) mb-2">
              Redeemed by {isLoading ? "…" : `(${data?.redemptions.length ?? 0})`}
            </h3>
            {isLoading ? (
              <p className="font-dm text-[13px] text-(--neutral-500)">Loading…</p>
            ) : !data?.redemptions.length ? (
              <p className="font-dm text-[13px] text-(--neutral-400)">
                Nobody has used this code yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {data.redemptions.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/customers?customer=${r.customer.id}`}
                      className="flex items-center gap-3 rounded-lg border border-(--neutral-200) px-3 py-2 hover:border-(--green-800) transition-colors"
                    >
                      {r.customer.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.customer.image}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-(--green-800) text-white flex items-center justify-center font-dm text-[12px] font-semibold shrink-0">
                          {(r.customer.name ?? "?").trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-dm text-[13px] font-medium text-(--neutral-900) truncate">
                          {r.customer.name ?? r.customer.id}
                        </p>
                        <p className="font-dm text-[11px] text-(--neutral-500) truncate">
                          {r.customer.email ?? "—"}
                        </p>
                      </div>
                      <span className="font-dm text-[11px] text-(--neutral-400) shrink-0">
                        {new Date(r.redeemedAt).toLocaleDateString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function FieldWrap({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">
        {label} {required && <span className="text-(--danger)">*</span>}
        {hint && <span className="text-(--neutral-400) font-normal ml-1 text-[12px]">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow";
