"use client";

/**
 * AdminStaffClient — Staff & Roles page
 *
 * Displays all admin users, their roles, last-active time, and status.
 * Invite Staff drawer → POST /api/admin/staff/invite
 * Row actions: View (no-op for now), Change Role, Reset Password, Deactivate
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, ShieldCheck, UserCog, Activity,
  MoreHorizontal, UserPlus, Mail, ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatCard } from "@/components/admin/ui/StatCard";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  adminProfile: {
    fullName: string;
    department: string | null;
    isActive: boolean;
  } | null;
}

const ROLES = ["Admin", "Manager", "Inventory", "Support", "Viewer"] as const;
type StaffRole = (typeof ROLES)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatLastActive(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

// Role pill colors matching the design spec
function RolePill({ role }: { role: string }) {
  const isOwner   = role === "owner";
  const isAdmin   = role === "admin" || role === "Admin";
  const base = "inline-flex items-center h-6 px-[10px] rounded-full font-dm text-[12px] font-medium";
  if (isOwner) return <span className={`${base} bg-(--green-800) text-white`}>Owner</span>;
  if (isAdmin) return <span className={`${base} bg-(--green-50) text-(--green-800)`}>Admin</span>;
  return <span className={`${base} bg-(--neutral-100) text-(--neutral-700)`}>{role}</span>;
}

// Avatar circle with initials
function Avatar({ name }: { name: string }) {
  return (
    <div className="w-9 h-9 rounded-full bg-(--green-200) text-(--green-800) flex items-center justify-center font-dm text-[13px] font-semibold shrink-0">
      {getInitials(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row actions dropdown
// ---------------------------------------------------------------------------
function RowActions({
  staff,
  onDeactivate,
}: {
  staff: StaffMember;
  onDeactivate: (s: StaffMember) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="w-8 h-8 flex items-center justify-center rounded-[6px] text-(--neutral-500) hover:bg-(--neutral-100) transition-colors"
        aria-label="Actions"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-44 bg-white dark:bg-(--dark-surface) rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e2) py-1 overflow-hidden">
            <button
              onClick={() => { setOpen(false); toast.info("Profile view coming soon"); }}
              className="w-full text-left px-4 py-2 font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              View
            </button>
            <button
              onClick={() => { setOpen(false); toast.info("Role management coming soon"); }}
              className="w-full text-left px-4 py-2 font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Change Role
            </button>
            <button
              onClick={() => { setOpen(false); toast.info("Password reset coming soon"); }}
              className="w-full text-left px-4 py-2 font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Reset Password
            </button>
            <div className="h-px bg-(--neutral-200) dark:bg-(--dark-border) my-1" />
            <button
              onClick={() => { setOpen(false); onDeactivate(staff); }}
              className="w-full text-left px-4 py-2 font-dm text-[14px] text-(--danger) hover:bg-(--danger-bg) transition-colors"
            >
              {staff.banned ? "Reactivate" : "Deactivate"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite Staff Drawer
// ---------------------------------------------------------------------------
function InviteDrawer({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Admin" as StaffRole,
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) e.name = "Full name required (min 2 chars).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Valid email required.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    try {
      const res = await fetch("/api/admin/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to send invitation.");
      toast.success("Invitation sent", { message: `${form.name} will receive an email shortly.` });
      setForm({ name: "", email: "", role: "Admin", note: "" });
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invitation.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = (field: string) =>
    `w-full h-10 px-3 rounded-[8px] border font-dm text-[14px] text-(--neutral-900) bg-white dark:bg-(--dark-surface) dark:text-(--dark-text) outline-none transition-colors focus:border-(--green-600) ${
      errors[field] ? "border-(--danger)" : "border-(--neutral-300) dark:border-(--dark-border)"
    }`;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Invite Staff Member"
      width={480}
      footer={
        <>
          <button
            onClick={onClose}
            className="h-10 px-5 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
          >
            Cancel
          </button>
          <button
            form="invite-form"
            type="submit"
            disabled={loading}
            className="h-10 px-6 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            <Mail size={15} />
            {loading ? "Sending…" : "Send Invitation"}
          </button>
        </>
      }
    >
      <form id="invite-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Full name */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Full name</label>
          <input
            className={inputCls("name")}
            placeholder="Jane Mwangi"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            autoComplete="name"
          />
          {errors.name && <p className="font-dm text-[12px] text-(--danger)">{errors.name}</p>}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Email address</label>
          <input
            type="email"
            className={inputCls("email")}
            placeholder="jane@fechiorganics.co.ke"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            autoComplete="email"
          />
          {errors.email && <p className="font-dm text-[12px] text-(--danger)">{errors.email}</p>}
        </div>

        {/* Role select */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Role</label>
          <div className="relative">
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as StaffRole }))}
              className="w-full h-10 pl-3 pr-9 rounded-[8px] border border-(--neutral-300) dark:border-(--dark-border) font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) bg-white dark:bg-(--dark-surface) outline-none appearance-none focus:border-(--green-600) transition-colors"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-500) pointer-events-none" />
          </div>
          <p className="font-dm text-[12px] text-(--neutral-400)">
            Managers can manage products and orders but cannot change settings or staff.
          </p>
        </div>

        {/* Personal note */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">
            Personal note <span className="text-(--neutral-400) font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 rounded-[8px] border border-(--neutral-300) dark:border-(--dark-border) font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) bg-white dark:bg-(--dark-surface) outline-none focus:border-(--green-600) transition-colors resize-none"
            placeholder="Hi Jane, we'd love to have you on the team…"
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
          />
        </div>
      </form>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminStaffClient() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMember | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Fetch staff list
  const { data, isLoading } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: () =>
      fetch("/api/admin/staff").then((r) => r.json()).then((j) => j.data?.staff ?? []),
  });

  const staff: StaffMember[] = data ?? [];

  // Stat counts
  const totalStaff  = staff.length;
  const adminCount  = staff.filter((s) => s.role === "admin").length;
  // "managers" = non-admin active staff — placeholder since we only have admin role in DB
  const activeCount = staff.filter((s) => !s.banned).length;

  // Deactivate / reactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: async (target: StaffMember) => {
      const res = await fetch(`/api/admin/staff/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: !target.banned }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update.");
    },
    onSuccess: (_d, target) => {
      toast.success(target.banned ? "Staff member reactivated." : "Staff member deactivated.");
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
      setDeactivateTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update staff member.");
    },
  });

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await deactivateMutation.mutateAsync(deactivateTarget);
    } finally {
      setDeactivating(false);
    }
  }

  // Table columns
  const columns = [
    {
      key: "name",
      label: "Staff Member",
      render: (_: unknown, row: Record<string, unknown>) => {
        const s = row as unknown as StaffMember;
        return (
          <div className="flex items-center gap-3">
            <Avatar name={s.name} />
            <div>
              <div className="font-dm text-[14px] font-medium text-(--neutral-900) dark:text-(--dark-text)">{s.name}</div>
              <div className="font-dm text-[12px] text-(--neutral-400)">{s.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "role",
      label: "Role",
      render: (_: unknown, row: Record<string, unknown>) => (
        <RolePill role={(row as unknown as StaffMember).role} />
      ),
    },
    {
      key: "lastActiveAt",
      label: "Last Active",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[13px] text-(--neutral-500)">
          {formatLastActive((row as unknown as StaffMember).lastActiveAt)}
        </span>
      ),
    },
    {
      key: "banned",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const s = row as unknown as StaffMember;
        return <StatusPill status={s.banned ? "archived" : "active"} />;
      },
    },
    {
      key: "_actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const s = row as unknown as StaffMember;
        return (
          <RowActions
            staff={s}
            onDeactivate={(target) => setDeactivateTarget(target)}
          />
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader
        title="Staff & Roles"
        description="Manage admin accounts and permissions"
        action={
          <button
            onClick={() => setInviteOpen(true)}
            className="h-10 px-5 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors flex items-center gap-2"
          >
            <UserPlus size={16} />
            Invite Staff
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard eyebrow="Total Staff" value={isLoading ? "—" : String(totalStaff)} icon={Users} />
          <StatCard eyebrow="Admins" value={isLoading ? "—" : String(adminCount)} icon={ShieldCheck} />
          <StatCard eyebrow="Active" value={isLoading ? "—" : String(activeCount)} icon={UserCog} />
          <StatCard eyebrow="Active Sessions" value="1" icon={Activity} />
        </div>

        {/* Staff table */}
        <DataTable
          columns={columns}
          data={staff as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No staff members yet"
          emptyDescription="Invite your first admin by clicking Invite Staff above."
          pageSize={20}
        />
      </div>

      {/* Invite drawer */}
      <InviteDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["admin-staff"] })}
      />

      {/* Deactivate confirm modal */}
      {deactivateTarget && (
        <ConfirmModal
          open={Boolean(deactivateTarget)}
          onClose={() => setDeactivateTarget(null)}
          onConfirm={handleDeactivate}
          title={deactivateTarget.banned ? "Reactivate staff member?" : "Deactivate staff member?"}
          description={
            deactivateTarget.banned
              ? `${deactivateTarget.name} will regain access to the admin panel.`
              : `${deactivateTarget.name} will lose access to the admin panel. This can be reversed.`
          }
          confirmLabel={deactivateTarget.banned ? "Reactivate" : "Deactivate"}
          danger={!deactivateTarget.banned}
          loading={deactivating}
        />
      )}
    </div>
  );
}
