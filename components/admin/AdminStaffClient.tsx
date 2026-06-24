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
  Eye, EyeOff, ChevronUp,
} from "lucide-react";
import CheckboxGreen from "@/components/ui/CheckboxGreen";
import { ALL_PAGES, permissionsFromRole, type AdminPage } from "@/lib/permissions";
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
// Role options for the enhanced invite drawer
// ---------------------------------------------------------------------------
const INVITE_ROLES = [
  "admin", "manager", "finance", "marketing",
  "inventory", "customer_care", "viewer", "custom",
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
    role: "viewer" as InviteRole,
    permissions: permissionsFromRole("viewer"),
    branchId: "",
    expiry: "lifetime" as string,
    customFrom: "",
    customTo: "",
    note: "",
    inviteChannels: [] as string[],
  });
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);

  // Fetch branches for the branch select
  const { data: branchData } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: () => fetch("/api/admin/branches").then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  });
  const branches: { id: string; name: string }[] = branchData?.branches ?? [];

  // When role changes, auto-populate permissions from template (unless custom)
  function handleRoleChange(role: InviteRole) {
    const perms = role === "custom" ? form.permissions : permissionsFromRole(role);
    setForm((p) => ({ ...p, role, permissions: perms }));
    // Show the permissions grid automatically for custom role
    if (role === "custom") setPermsOpen(true);
  }

  function togglePage(page: AdminPage) {
    setForm((p) => {
      const pages = p.permissions.pages.includes(page)
        ? p.permissions.pages.filter((pg) => pg !== page)
        : [...p.permissions.pages, page];
      return { ...p, permissions: { pages } };
    });
  }

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
          permissions:      form.permissions,
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
        name: "", username: "", email: "", phone: "", password: "",
        role: "viewer", permissions: permissionsFromRole("viewer"),
        branchId: "", expiry: "lifetime", customFrom: "", customTo: "",
        note: "", inviteChannels: [],
      });
      setPermsOpen(false);
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

        {/* Password + generate */}
        <div className="flex flex-col gap-1.5">
          <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Password</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showPw ? "text" : "password"}
                className={`${inputCls("password")} pr-10`}
                placeholder="Set an initial password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-500) hover:text-(--neutral-800)"
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, password: generatePassword() }))}
              className="h-10 px-3 rounded-[8px] border border-(--neutral-300) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) whitespace-nowrap transition-colors"
            >
              Generate
            </button>
          </div>
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
              onChange={(e) => handleRoleChange(e.target.value as InviteRole)}
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

        {/* Page permissions accordion */}
        <div className="border border-(--neutral-200) dark:border-(--dark-border) rounded-[10px] overflow-hidden">
          <button
            type="button"
            onClick={() => setPermsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 font-dm text-[13px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
          >
            <span>Page permissions</span>
            {permsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {permsOpen && (
            <div className="px-4 pb-4 grid grid-cols-4 gap-x-3 gap-y-3 border-t border-(--neutral-200) dark:border-(--dark-border) pt-4">
              {ALL_PAGES.map((page) => (
                <label key={page} className="flex flex-col items-center gap-1 cursor-pointer">
                  <CheckboxGreen
                    checked={form.permissions.pages.includes(page)}
                    onChange={() => togglePage(page)}
                  />
                  <span className="font-dm text-[11px] text-(--neutral-600) text-center capitalize leading-tight">
                    {page.replace("_", " ")}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

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
