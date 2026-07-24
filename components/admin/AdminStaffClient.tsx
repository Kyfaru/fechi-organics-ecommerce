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
import { PermissionOverrideGrid } from "@/components/admin/PermissionOverrideGrid";
import type { RoleName } from "@/lib/permissions";
import { StatsCard } from "@/components/ui/stats-card";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import StrongPasswordInput from "@/components/auth/StrongPasswordInput";
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
    role: string;
    permissions?: { deny?: string[] } | null;
  } | null;
}

const ROLES = ["Admin", "Manager", "Inventory", "Support", "Viewer"] as const;
type StaffRole = (typeof ROLES)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function getInitials(name: string): string {
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
// Exported so other admin surfaces (e.g. AuthorPicker) that display an
// adminProfile.role can reuse this instead of re-implementing the pill.
export function RolePill({ role }: { role: string }) {
  const isOwner   = role === "owner";
  const isAdmin   = role === "admin" || role === "Admin";
  const base = "inline-flex items-center h-6 px-[10px] rounded-full font-dm text-[12px] font-medium";
  if (isOwner) return <span className={`${base} bg-(--green-800) text-white`}>Owner</span>;
  if (isAdmin) return <span className={`${base} bg-(--green-50) text-(--green-800)`}>Admin</span>;
  return <span className={`${base} bg-(--neutral-100) text-(--neutral-700)`}>{role}</span>;
}

// Avatar circle with initials
// Exported for reuse — staff `user.image` isn't consistently populated, so
// every staff-listing surface (this table, AuthorPicker) falls back to
// initials rather than rendering a possibly-missing photo.
export function Avatar({ name }: { name: string }) {
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
  onDelete,
  onResetPassword,
  onChangeRole,
  onEditPermissions,
}: {
  staff: StaffMember;
  onDeactivate: (s: StaffMember) => void;
  onDelete: (s: StaffMember) => void;
  onResetPassword: (s: StaffMember) => void;
  onChangeRole: (s: StaffMember) => void;
  onEditPermissions: (s: StaffMember) => void;
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-48 bg-white dark:bg-(--dark-surface) rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e2) py-1 overflow-hidden">
            <button
              onClick={() => { setOpen(false); onChangeRole(staff); }}
              className="w-full text-left px-4 py-2 font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Change Role
            </button>
            <button
              onClick={() => { setOpen(false); onEditPermissions(staff); }}
              className="w-full text-left px-4 py-2 font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Edit Permissions
            </button>
            <button
              onClick={() => { setOpen(false); onResetPassword(staff); }}
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
            {staff.banned && (
              <button
                onClick={() => { setOpen(false); onDelete(staff); }}
                className="w-full text-left px-4 py-2 font-dm text-[14px] text-(--danger) hover:bg-(--danger-bg) transition-colors"
              >
                Delete Permanently
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role options for the enhanced invite drawer
// ---------------------------------------------------------------------------
const INVITE_ROLES = [
  "admin", "manager", "finance", "marketing",
  "inventory", "customer_care", "viewer",
] as const;
type InviteRole = (typeof INVITE_ROLES)[number];

// Expiry presets
const EXPIRY_OPTIONS = [
  { label: "Lifetime",  value: "lifetime" },
  { label: "1 Day",     value: "1d" },
  { label: "7 Days",    value: "7d" },
  { label: "30 Days",   value: "30d" },
  { label: "3 Months",  value: "3m" },
  { label: "Custom",    value: "custom" },
] as const;

// Maps preset keys to number of days (null = no expiry)
const EXPIRY_DAYS: Record<string, number | null> = {
  lifetime: null,
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "3m": 90,
};

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Generates a random 12-character password from a safe character set. */
function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: 12 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

// ---------------------------------------------------------------------------
// Invite Staff Drawer (enhanced)
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
    username: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "viewer" as InviteRole,
    deny: [] as string[],
    branchId: "",
    expiry: "lifetime" as string,
    customFrom: "",
    customTo: "",
    note: "",
    inviteChannels: [] as string[],
  });
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(false);

  // Fetch branches for the branch select
  const { data: branchData } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: () => fetch("/api/admin/branches").then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  });
  const branches: { id: string; name: string }[] = branchData?.branches ?? [];

  function toggleChannel(channel: string) {
    setForm((p) => ({
      ...p,
      inviteChannels: p.inviteChannels.includes(channel)
        ? p.inviteChannels.filter((c) => c !== channel)
        : [...p.inviteChannels, channel],
    }));
  }

  // Compute accessExpiresAt from the expiry selection
  function resolveExpiry(): string | null {
    if (form.expiry === "lifetime") return null;
    if (form.expiry === "custom") return form.customTo || null;
    const days = EXPIRY_DAYS[form.expiry];
    if (days === null || days === undefined) return null;
    return addDays(days);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2)
      e.name = "Full name required (min 2 chars).";
    if (form.username && !/^\w{3,}$/.test(form.username))
      e.username = "Username must be alphanumeric/underscore, min 3 chars.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Valid email required.";
    if (!form.password)
      e.password = "Password is required.";
    else if (form.password !== form.confirmPassword)
      e.password = "Passwords do not match.";
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
        body: JSON.stringify({
          name:             form.name.trim(),
          username:         form.username.trim() || undefined,
          email:            form.email.toLowerCase(),
          phone:            form.phone.trim() || undefined,
          password:         form.password,
          role:             form.role,
          permissions:      form.deny.length > 0 ? { deny: form.deny } : undefined,
          branchId:         form.branchId || undefined,
          accessExpiresAt:  resolveExpiry(),
          note:             form.note.trim() || undefined,
          inviteChannels:   form.inviteChannels,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to send invitation.");
      toast.success("Staff member invited", { message: `${form.name} has been added.` });
      // Reset form
      setForm({
        name: "", username: "", email: "", phone: "", password: "", confirmPassword: "",
        role: "viewer", deny: [],
        branchId: "", expiry: "lifetime", customFrom: "", customTo: "",
        note: "", inviteChannels: [],
      });
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
  const selectCls =
    "w-full h-10 pl-3 pr-9 rounded-[8px] border border-(--neutral-300) dark:border-(--dark-border) font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) bg-white dark:bg-(--dark-surface) outline-none appearance-none focus:border-(--green-600) transition-colors";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Invite Staff Member"
      width={640}
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

        {/* Username */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">
            Username <span className="text-(--neutral-400) font-normal">(optional)</span>
          </label>
          <input
            className={inputCls("username")}
            placeholder="jane_admin"
            value={form.username}
            onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            autoComplete="off"
          />
          {errors.username && <p className="font-dm text-[12px] text-(--danger)">{errors.username}</p>}
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

        {/* Phone */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">
            Phone <span className="text-(--neutral-400) font-normal">(optional, for SMS invite)</span>
          </label>
          <input
            type="tel"
            className={inputCls("phone")}
            placeholder="+254700000000"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            autoComplete="tel"
          />
        </div>

        {/* Password + confirm */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Password</label>
            <button
              type="button"
              onClick={() => {
                const generated = generatePassword();
                setForm((p) => ({ ...p, password: generated, confirmPassword: generated }));
              }}
              className="h-8 px-3 rounded-[8px] border border-(--neutral-300) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) whitespace-nowrap transition-colors"
            >
              Generate
            </button>
          </div>
          <StrongPasswordInput
            password={form.password}
            confirmPassword={form.confirmPassword}
            onPasswordChange={(v) => setForm((p) => ({ ...p, password: v }))}
            onConfirmPasswordChange={(v) => setForm((p) => ({ ...p, confirmPassword: v }))}
            submitted={Object.keys(errors).length > 0}
          />
          {errors.password && <p className="font-dm text-[12px] text-(--danger)">{errors.password}</p>}
        </div>

        {/* Branch select */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Branch</label>
          <div className="relative">
            <select
              value={form.branchId}
              onChange={(e) => setForm((p) => ({ ...p, branchId: e.target.value }))}
              className={selectCls}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-500) pointer-events-none" />
          </div>
        </div>

        {/* Role select */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Role</label>
          <div className="relative">
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as InviteRole, deny: [] }))}
              className={selectCls}
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1).replace("_", " ")}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-500) pointer-events-none" />
          </div>
        </div>

        <PermissionOverrideGrid
          role={form.role}
          deny={form.deny}
          onChange={(deny) => setForm((p) => ({ ...p, deny }))}
        />

        {/* Access timeframe */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Access timeframe</label>
          <div className="relative">
            <select
              value={form.expiry}
              onChange={(e) => setForm((p) => ({ ...p, expiry: e.target.value }))}
              className={selectCls}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-500) pointer-events-none" />
          </div>
          {form.expiry === "custom" && (
            <div className="flex gap-3 mt-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="font-dm text-[12px] text-(--neutral-500)">From</label>
                <input
                  type="date"
                  className={inputCls("customFrom")}
                  value={form.customFrom}
                  onChange={(e) => setForm((p) => ({ ...p, customFrom: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="font-dm text-[12px] text-(--neutral-500)">To</label>
                <input
                  type="date"
                  className={inputCls("customTo")}
                  value={form.customTo}
                  onChange={(e) => setForm((p) => ({ ...p, customTo: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        {/* Invitation channels */}
        <div className="flex flex-col gap-2">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Send invite via</label>
          <div className="flex gap-2">
            {["email", "sms"].map((channel) => {
              const active = form.inviteChannels.includes(channel);
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => toggleChannel(channel)}
                  className={[
                    "h-9 px-4 rounded-[8px] font-dm text-[13px] font-medium border transition-colors capitalize",
                    active
                      ? "bg-(--green-800) text-white border-(--green-800)"
                      : "bg-white border-(--neutral-300) text-(--neutral-700) hover:bg-(--neutral-50)",
                  ].join(" ")}
                >
                  {channel.toUpperCase()}
                </button>
              );
            })}
          </div>
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

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [resetAdminPw, setResetAdminPw] = useState("");
  const [resetVerified, setResetVerified] = useState(false);
  const [resetMode, setResetMode] = useState<"idle" | "link" | "set">("idle");
  const [newPwForUser, setNewPwForUser] = useState("");
  const [confirmPwForUser, setConfirmPwForUser] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Change role modal
  const [roleTarget, setRoleTarget] = useState<StaffMember | null>(null);
  const [roleAdminPw, setRoleAdminPw] = useState("");
  const [roleVerified, setRoleVerified] = useState(false);
  const [selectedRole, setSelectedRole] = useState("viewer");
  const [roleLoading, setRoleLoading] = useState(false);

  // Edit permissions modal — narrows one staff member's access below their
  // role's ceiling. Separate action from "Change Role" on purpose.
  const [permTarget, setPermTarget] = useState<StaffMember | null>(null);
  const [permAdminPw, setPermAdminPw] = useState("");
  const [permVerified, setPermVerified] = useState(false);
  const [permDeny, setPermDeny] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);

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

  // Verify admin's own password
  async function verifyAdminPassword(password: string): Promise<boolean> {
    const res = await fetch("/api/admin/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    return json.ok === true;
  }

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (target: StaffMember) => {
      const res = await fetch(`/api/admin/staff/${target.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Delete failed");
    },
    onSuccess: (_d, target) => {
      toast.success(`${target.name} deleted.`);
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await deleteMutation.mutateAsync(deleteTarget); } finally { setDeleting(false); }
  }

  // Reset password handlers
  async function handleVerifyForReset() {
    setResetLoading(true);
    try {
      const ok = await verifyAdminPassword(resetAdminPw);
      if (!ok) { toast.error("Incorrect password"); return; }
      setResetVerified(true);
    } finally { setResetLoading(false); }
  }

  async function handleSendResetLink() {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/staff/send-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resetTarget.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed");
      toast.success("Reset link sent (expires in 45 minutes)");
      closeResetModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setResetLoading(false); }
  }

  async function handleSetNewPassword() {
    if (!resetTarget || newPwForUser.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/staff/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resetTarget.id, newPassword: newPwForUser }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed");
      toast.success("Password updated");
      closeResetModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setResetLoading(false); }
  }

  function closeResetModal() {
    setResetTarget(null); setResetAdminPw(""); setResetVerified(false);
    setResetMode("idle"); setNewPwForUser(""); setConfirmPwForUser(""); setResetLoading(false);
  }

  // Change role handlers
  async function handleVerifyForRole() {
    setRoleLoading(true);
    try {
      const ok = await verifyAdminPassword(roleAdminPw);
      if (!ok) { toast.error("Incorrect password"); return; }
      setRoleVerified(true);
    } finally { setRoleLoading(false); }
  }

  async function handleSaveRole() {
    if (!roleTarget) return;
    setRoleLoading(true);
    try {
      const res = await fetch(`/api/admin/staff/${roleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed");
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
      closeRoleModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setRoleLoading(false); }
  }

  function closeRoleModal() {
    setRoleTarget(null); setRoleAdminPw(""); setRoleVerified(false);
    setSelectedRole("viewer"); setRoleLoading(false);
  }

  function openPermModal(target: StaffMember) {
    setPermTarget(target);
    setPermDeny(target.adminProfile?.permissions?.deny ?? []);
  }

  async function handleVerifyForPerm() {
    setPermLoading(true);
    try {
      const ok = await verifyAdminPassword(permAdminPw);
      if (!ok) { toast.error("Incorrect password"); return; }
      setPermVerified(true);
    } finally { setPermLoading(false); }
  }

  async function handleSavePerm() {
    if (!permTarget) return;
    setPermLoading(true);
    try {
      const res = await fetch(`/api/admin/staff/${permTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: { deny: permDeny } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed");
      toast.success("Permissions updated");
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
      closePermModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setPermLoading(false); }
  }

  function closePermModal() {
    setPermTarget(null); setPermAdminPw(""); setPermVerified(false);
    setPermDeny([]); setPermLoading(false);
  }

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
            onDelete={(target) => setDeleteTarget(target)}
            onResetPassword={(target) => { setResetTarget(target); setResetAdminPw(""); setResetVerified(false); setResetMode("idle"); }}
            onChangeRole={(target) => { setRoleTarget(target); setRoleAdminPw(""); setRoleVerified(false); setSelectedRole(target.adminProfile?.role ?? "viewer"); }}
            onEditPermissions={openPermModal}
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
          <StatsCard title="Total Staff" value={String(totalStaff)} icon={<Users className="h-4 w-4 text-muted-foreground" />} change="—" changeType="positive" />
          <StatsCard title="Admins" value={String(adminCount)} icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />} change="—" changeType="positive" />
          <StatsCard title="Active" value={String(activeCount)} icon={<UserCog className="h-4 w-4 text-muted-foreground" />} change="—" changeType="positive" />
          <StatsCard title="Active Sessions" value="1" icon={<Activity className="h-4 w-4 text-muted-foreground" />} change="—" changeType="positive" />
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

      {/* Delete confirm modal */}
      {deleteTarget && (
        <ConfirmModal
          open
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Permanently delete staff member?"
          description={`This will delete ${deleteTarget.name}'s account, sessions, and profile. This cannot be undone.`}
          confirmLabel="Delete permanently"
          danger
          loading={deleting}
        />
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-(--dark-surface) rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-syne text-[18px] font-bold text-(--neutral-900) dark:text-(--dark-text)">
              Reset password — {resetTarget.name}
            </h3>

            {!resetVerified ? (
              <>
                <p className="font-dm text-[13px] text-(--neutral-500)">Enter your own admin password to continue.</p>
                <input
                  type="password"
                  value={resetAdminPw}
                  onChange={(e) => setResetAdminPw(e.target.value)}
                  placeholder="Your password"
                  className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={closeResetModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleVerifyForReset} disabled={resetLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Verify</button>
                </div>
              </>
            ) : resetMode === "idle" ? (
              <>
                <p className="font-dm text-[13px] text-(--neutral-500)">Choose how to reset {resetTarget.name}&apos;s password.</p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => setResetMode("link")} className="w-full h-11 rounded-xl border border-(--green-500) text-(--green-700) font-dm text-[14px] font-medium hover:bg-(--green-50) transition-colors">
                    Send reset link (expires 45 min)
                  </button>
                  <button onClick={() => setResetMode("set")} className="w-full h-11 rounded-xl bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors">
                    Set new password directly
                  </button>
                </div>
                <button onClick={closeResetModal} className="w-full text-center font-dm text-[13px] text-(--neutral-500) hover:text-(--neutral-700)">Cancel</button>
              </>
            ) : resetMode === "link" ? (
              <>
                <p className="font-dm text-[13px] text-(--neutral-500)">A reset link will be emailed and/or SMSed to {resetTarget.name}. Link expires in 45 minutes.</p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setResetMode("idle")} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Back</button>
                  <button onClick={handleSendResetLink} disabled={resetLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Send Link</button>
                </div>
              </>
            ) : (
              <>
                <p className="font-dm text-[13px] text-(--neutral-500)">Set a new password for {resetTarget.name}. They will be able to log in immediately.</p>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const generated = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
                      setNewPwForUser(generated);
                      setConfirmPwForUser(generated);
                    }}
                    className="h-8 px-3 rounded-[8px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-600) hover:bg-(--neutral-50)"
                  >
                    Generate
                  </button>
                </div>
                <StrongPasswordInput
                  password={newPwForUser}
                  confirmPassword={confirmPwForUser}
                  onPasswordChange={setNewPwForUser}
                  onConfirmPasswordChange={setConfirmPwForUser}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setResetMode("idle")} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Back</button>
                  <button
                    onClick={handleSetNewPassword}
                    disabled={resetLoading || newPwForUser.length < 8 || newPwForUser !== confirmPwForUser}
                    className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60"
                  >
                    Set Password
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Change role modal */}
      {roleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-(--dark-surface) rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-syne text-[18px] font-bold text-(--neutral-900) dark:text-(--dark-text)">
              Change role — {roleTarget.name}
            </h3>

            {!roleVerified ? (
              <>
                <p className="font-dm text-[13px] text-(--neutral-500)">Enter your own admin password to continue.</p>
                <input
                  type="password"
                  value={roleAdminPw}
                  onChange={(e) => setRoleAdminPw(e.target.value)}
                  placeholder="Your password"
                  className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={closeRoleModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleVerifyForRole} disabled={roleLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Verify</button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Role</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                  >
                    {(["super_admin","admin","manager","finance","marketing","inventory","customer_care","viewer"] as const).map((r) => (
                      <option key={r} value={r}>{r.replace("_", " ")}</option>
                    ))}
                  </select>
                  <p className="font-dm text-[12px] text-(--neutral-400) mt-1.5">
                    Permissions for each role are fixed and defined in code — see Staff → Roles.
                  </p>
                </div>

                <div className="flex gap-2 justify-end">
                  <button onClick={closeRoleModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleSaveRole} disabled={roleLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Save Role</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit permissions modal */}
      {permTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-(--dark-surface) rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-syne text-[18px] font-bold text-(--neutral-900) dark:text-(--dark-text)">
              Edit permissions — {permTarget.name}
            </h3>

            {!permVerified ? (
              <>
                <p className="font-dm text-[13px] text-(--neutral-500)">Enter your own admin password to continue.</p>
                <input
                  type="password"
                  value={permAdminPw}
                  onChange={(e) => setPermAdminPw(e.target.value)}
                  placeholder="Your password"
                  className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={closePermModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleVerifyForPerm} disabled={permLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Verify</button>
                </div>
              </>
            ) : (
              <>
                <PermissionOverrideGrid
                  role={(permTarget.adminProfile?.role ?? "viewer") as RoleName}
                  deny={permDeny}
                  onChange={setPermDeny}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={closePermModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleSavePerm} disabled={permLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Save Permissions</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
