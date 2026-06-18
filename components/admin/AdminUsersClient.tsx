"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Users, X, Copy, Wand2, KeyRound, UserPlus, ShieldCheck, UserCheck, UserX, Search, XCircle, Pencil } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AdminProfileSnippet = {
  id: string;
  fullName: string;
  department: string | null;
  permissions: Record<string, unknown>;
  isActive: boolean;
};

type ClientProfileSnippet = {
  id: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  loginCount: number;
};

type AdminUser = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: "admin" | "client";
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  updatedAt: string;
  sessions: { createdAt: string }[];
  adminProfile: AdminProfileSnippet | null;
  clientProfile: ClientProfileSnippet | null;
};

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "admin" | "client";
  department: string;
  password: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns relative time string, e.g. "3 days ago" */
function relativeTime(iso: string | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Generates a readable 12-char password — mirrors the server-side version */
function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => chars[b % chars.length])
    .join("");
}

/** Copies text to clipboard and returns a promise */
async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

/** Avatar circle showing the user's initial */
function Avatar({ name, role }: { name: string; role: "admin" | "client" }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-heading font-semibold text-[14px] text-white"
      style={{ backgroundColor: role === "admin" ? "#DEAE00" : "#27731E" }}
    >
      {initial}
    </div>
  );
}

/** Role pill badge */
function RoleBadge({ role }: { role: "admin" | "client" }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-[12px] font-semibold text-white"
      style={{ backgroundColor: role === "admin" ? "#FFC800" : "#27731E" }}
    >
      {role === "admin" ? "Admin" : "Client"}
    </span>
  );
}

/** Status indicator dot */
function StatusDot({ banned }: { banned: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-body text-[13px]">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: banned ? "#dc2626" : "#27731E" }}
      />
      <span style={{ color: banned ? "#dc2626" : "#27731E" }}>
        {banned ? "Banned" : "Active"}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  icon: IconComp,
  color,
  isLoading,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  isLoading: boolean;
}) {
  return (
    <div
      className="bg-white rounded-[16px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex items-center gap-4"
    >
      <div
        className="w-12 h-12 rounded-[12px] flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}18` }}
      >
        <IconComp size={24} style={{ color }} />
      </div>
      <div>
        {isLoading ? (
          <>
            <Skeleton className="h-6 w-12 rounded mb-1" />
            <Skeleton className="h-3 w-20 rounded" />
          </>
        ) : (
          <>
            <p className="font-heading font-semibold text-[#1a1c1c] text-[22px] leading-none">
              {value.toLocaleString()}
            </p>
            <p className="font-body text-[#40493c] text-[13px] mt-0.5">{label}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CustomSelect — inline dropdown, matches the contact page pattern
// ---------------------------------------------------------------------------
type SelectOption = { value: string; label: string };

function CustomSelect({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
}) {
  const inputClass =
    "w-full font-body text-[14px] text-[#1a1c1c] rounded-[8px] border border-[#c0cab8] bg-white px-3 py-2.5 focus:outline-none focus:border-[#27731e] transition-colors appearance-none cursor-pointer";
  const labelClass =
    "block font-body text-[#40493c] text-[12px] font-semibold uppercase tracking-[0.6px] mb-1.5";

  return (
    <div className="relative">
      {label && <label className={labelClass}>{label}</label>}
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="absolute right-3 pointer-events-none"
        style={{
          color: "#a1a1a1",
          top: label ? "calc(50% + 10px)" : "50%",
          transform: "translateY(-50%)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: "#f0f4ef" }}
      >
        <Users size={32} style={{ color: "#c0cab8" }} />
      </div>
      <p className="font-heading text-[#1a1c1c] text-[17px] font-semibold mb-1">No users found</p>
      <p className="font-body text-[#40493c] text-[14px]">
        Adjust your filters or add a new user.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table row skeleton
// ---------------------------------------------------------------------------
function TableRowSkeleton() {
  return (
    <tr className="border-b border-[#f0f0f0]">
      {[200, 80, 120, 80, 120, 80].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 rounded" style={{ width: w }} />
        </td>
      ))}
      <td className="px-4 py-3 flex gap-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// UserDrawer — slide from right, same spring as ProductDrawer
// ---------------------------------------------------------------------------
type DrawerProps = {
  open: boolean;
  onClose: () => void;
  editing: AdminUser | null;
  form: FormData;
  onFormChange: (key: keyof FormData, value: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  newPasswordBanner: string | null;
  onClearBanner: () => void;
  isResettingPassword: boolean;
  onResetPassword: () => void;
};

function UserDrawer({
  open,
  onClose,
  editing,
  form,
  onFormChange,
  onSubmit,
  isPending,
  newPasswordBanner,
  onClearBanner,
  isResettingPassword,
  onResetPassword,
}: DrawerProps) {
  const isNew = editing === null;

  const labelClass =
    "block font-body text-[#40493c] text-[12px] font-semibold uppercase tracking-[0.6px] mb-1.5";

  function handleAutoGenerate() {
    const pw = generatePassword();
    onFormChange("password", pw);
    copyToClipboard(pw)
      .then(() => toast.success("Password copied to clipboard"))
      .catch(() => {/* clipboard denied — password still filled */});
  }

  const roleOptions: SelectOption[] = [
    { value: "client", label: "Client" },
    { value: "admin", label: "Admin" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="users-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            key="users-drawer-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
            className="fixed right-0 top-0 h-full z-50 flex flex-col bg-white shadow-2xl"
            style={{ width: "min(480px, 100vw)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#e2e2e2]">
              <h2 className="font-heading font-semibold text-[#1a1c1c] text-[18px]">
                {isNew ? "Add User" : "Edit User"}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                style={{ backgroundColor: "#f3f4f6", color: "#40493c" }}
                aria-label="Close drawer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">

              {/* New password banner — shown after a reset */}
              <AnimatePresence>
                {newPasswordBanner && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-[10px] px-4 py-3 flex items-center justify-between gap-3"
                    style={{ backgroundColor: "#e8fce3", border: "1px solid #43A935" }}
                  >
                    <div>
                      <p className="font-body text-[12px] font-semibold text-[#27731E] uppercase tracking-wide mb-0.5">
                        New password generated
                      </p>
                      <p className="font-body text-[14px] text-[#1a1c1c] font-mono tracking-wider">
                        {newPasswordBanner}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        copyToClipboard(newPasswordBanner).then(() =>
                          toast.success("Password copied")
                        );
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] font-body text-[12px] font-semibold text-white transition-colors"
                      style={{ backgroundColor: "#27731E" }}
                    >
                      <Copy size={14} />
                      Copy
                    </button>
                    <button onClick={onClearBanner} aria-label="Dismiss">
                      <X size={16} style={{ color: "#40493c" }} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Name row */}
              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  label="First Name"
                  placeholder="Jane"
                  value={form.firstName}
                  onChange={(e) => onFormChange("firstName", e.target.value)}
                />
                <FormInput
                  label="Last Name"
                  placeholder="Doe"
                  value={form.lastName}
                  onChange={(e) => onFormChange("lastName", e.target.value)}
                />
              </div>

              {/* Email */}
              <FormInput
                label="Email"
                type="email"
                placeholder="jane@example.com"
                value={form.email}
                onChange={(e) => onFormChange("email", e.target.value)}
              />

              {/* Phone */}
              <FormInput
                label="Phone"
                type="tel"
                placeholder="+254 700 000000"
                value={form.phone}
                onChange={(e) => onFormChange("phone", e.target.value)}
              />

              {/* Role */}
              <CustomSelect
                label="Role"
                value={form.role}
                onChange={(v) => onFormChange("role", v)}
                options={roleOptions}
              />

              {/* Department — only shown for admin role */}
              {form.role === "admin" && (
                <FormInput
                  label="Department"
                  placeholder="e.g. Operations"
                  value={form.department}
                  onChange={(e) => onFormChange("department", e.target.value)}
                />
              )}

              {/* Password section */}
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <PasswordInput
                    label={isNew ? "Password" : "New Password"}
                    placeholder={isNew ? "Min. 8 characters" : "Leave blank to keep current"}
                    value={form.password}
                    onChange={(e) => onFormChange("password", e.target.value)}
                  />
                </div>

                {/* Auto-generate button */}
                <button
                  type="button"
                  onClick={handleAutoGenerate}
                  className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] font-body text-[12px] font-semibold transition-colors border"
                  style={{
                    borderColor: "#c0cab8",
                    color: "#40493c",
                    backgroundColor: "#fafafa",
                  }}
                >
                  <Wand2 size={14} />
                  Auto-generate &amp; copy
                </button>
              </div>

              {/* Reset Password button — edit mode only */}
              {!isNew && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={onResetPassword}
                    disabled={isResettingPassword}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] font-body text-[13px] font-semibold border transition-colors disabled:opacity-60"
                    style={{
                      borderColor: "#DEAE00",
                      color: "#92400e",
                      backgroundColor: "#FFF2C0",
                    }}
                  >
                    {isResettingPassword ? (
                      <Spinner size={14} />
                    ) : (
                      <KeyRound size={16} />
                    )}
                    Reset Password
                  </button>
                  <p className="font-body text-[11px] mt-1.5" style={{ color: "#a1a1a1" }}>
                    Generates a new password and shows it above for you to share.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#e2e2e2] flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isPending}
                className="px-5 py-2.5 rounded-[8px] font-body text-[14px] font-semibold transition-colors border border-[#c0cab8] text-[#40493c] hover:border-[#27731e] hover:text-[#27731e] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={isPending}
                className="px-6 py-2.5 rounded-[8px] font-body text-[14px] font-semibold text-white transition-all flex items-center gap-2 disabled:opacity-70"
                style={{ backgroundColor: isPending ? "#40793a" : "#27731e" }}
              >
                {isPending && <Spinner size={16} invert />}
                {isNew ? "Create User" : "Save Changes"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Blank form factory
// ---------------------------------------------------------------------------
function blankForm(): FormData {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "client",
    department: "",
    password: "",
  };
}

function userToForm(u: AdminUser): FormData {
  return {
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    email: u.email,
    phone: u.clientProfile?.phone ?? "",
    role: u.role,
    department: u.adminProfile?.department ?? "",
    password: "",
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminUsersClient() {
  const qc = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<FormData>(blankForm());
  const [newPasswordBanner, setNewPasswordBanner] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const { data, isLoading } = useQuery<{ ok: boolean; data: { users: AdminUser[]; total: number } }>({
    queryKey: ["admin-users", roleFilter, statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      return fetch(`/api/admin/users?${params}`).then((r) => r.json());
    },
  });

  const users = data?.data?.users ?? [];
  const total = data?.data?.total ?? 0;

  // Derived stats from the full (unfiltered) users list
  // Fetch unfiltered totals for the stat cards
  const { data: statsData } = useQuery<{ ok: boolean; data: { users: AdminUser[]; total: number } }>({
    queryKey: ["admin-users-stats"],
    queryFn: () => fetch("/api/admin/users?limit=200").then((r) => r.json()),
    staleTime: 30_000,
  });

  const allUsers = statsData?.data?.users ?? [];
  const totalStaff = allUsers.filter((u) => u.role === "admin").length;
  const activeCount = allUsers.filter((u) => !u.banned).length;
  const bannedCount = allUsers.filter((u) => u.banned).length;
  const clientCount = allUsers.filter((u) => u.role === "client").length;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const createUser = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error?.message ?? "Could not create user");
        return;
      }
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users-stats"] });
      closeDrawer();
    },
    onError: () => toast.error("Could not create user"),
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error?.message ?? "Could not update user");
        return;
      }
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users-stats"] });
      closeDrawer();
    },
    onError: () => toast.error("Could not update user"),
  });

  const resetPassword = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPassword: true }),
      });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error?.message ?? "Password reset failed");
        return;
      }
      if (res.data?.newPassword) {
        setNewPasswordBanner(res.data.newPassword);
      }
      toast.success("Password reset — copy the new password above");
    },
    onError: () => toast.error("Password reset failed"),
  });

  const deactivateUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error?.message ?? "Could not deactivate user");
        return;
      }
      toast.success("User deactivated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users-stats"] });
    },
    onError: () => toast.error("Could not deactivate user"),
  });

  // ---------------------------------------------------------------------------
  // Drawer helpers
  // ---------------------------------------------------------------------------
  const openCreateDrawer = () => {
    setEditingUser(null);
    setForm(blankForm());
    setNewPasswordBanner(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (user: AdminUser) => {
    setEditingUser(user);
    setForm(userToForm(user));
    setNewPasswordBanner(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    // Delay clearing editing state so exit animation completes cleanly
    setTimeout(() => {
      setEditingUser(null);
      setNewPasswordBanner(null);
    }, 300);
  };

  const handleFormChange = useCallback((key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = () => {
    if (!form.firstName.trim()) { toast.error("First name is required"); return; }
    if (!form.lastName.trim()) { toast.error("Last name is required"); return; }
    if (!form.email.trim()) { toast.error("Email is required"); return; }

    if (editingUser) {
      const body: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(form.department.trim() ? { department: form.department.trim() } : {}),
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
      };
      updateUser.mutate({ id: editingUser.id, body });
    } else {
      if (!form.password.trim() || form.password.length < 8) {
        toast.error("Password must be at least 8 characters");
        return;
      }
      const body: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        role: form.role,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.department.trim() ? { department: form.department.trim() } : {}),
      };
      createUser.mutate(body);
    }
  };

  const isPending = createUser.isPending || updateUser.isPending;

  // ---------------------------------------------------------------------------
  // Filter options
  // ---------------------------------------------------------------------------
  const roleOptions: SelectOption[] = [
    { value: "all", label: "All Roles" },
    { value: "admin", label: "Admin" },
    { value: "client", label: "Client" },
  ];

  const statusOptions: SelectOption[] = [
    { value: "all", label: "All Status" },
    { value: "active", label: "Active" },
    { value: "banned", label: "Banned" },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen">
      {/* ------------------------------------------------------------------
          Page header
      ------------------------------------------------------------------ */}
      <div
        className="px-6 py-5 border-b flex items-center justify-between bg-white"
        style={{ borderColor: "#e2e2e2" }}
      >
        <div>
          <h1 className="font-heading font-semibold text-[#1a1c1c] text-[24px] leading-tight">
            Users
          </h1>
          <p className="font-body text-[#40493c] text-[13px] mt-0.5">
            {isLoading ? "Loading…" : `${total} user${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={openCreateDrawer}
          className="inline-flex items-center gap-2 rounded-[8px] px-5 py-2.5 font-body text-[14px] font-semibold text-white transition-all hover:brightness-110 active:brightness-95"
          style={{ backgroundColor: "#27731e" }}
        >
          <UserPlus size={18} />
          Add User
        </button>
      </div>

      {/* ------------------------------------------------------------------
          Body
      ------------------------------------------------------------------ */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6">

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Staff"
            value={totalStaff}
            icon={ShieldCheck}
            color="#DEAE00"
            isLoading={isLoading}
          />
          <StatCard
            label="Active Users"
            value={activeCount}
            icon={UserCheck}
            color="#27731E"
            isLoading={isLoading}
          />
          <StatCard
            label="Banned / Inactive"
            value={bannedCount}
            icon={UserX}
            color="#dc2626"
            isLoading={isLoading}
          />
          <StatCard
            label="Clients"
            value={clientCount}
            icon={Users}
            color="#43A935"
            isLoading={isLoading}
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-[360px]">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#a1a1a1" }}
            />
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-[8px] border font-body text-[14px] text-[#1a1c1c] bg-white focus:outline-none transition-colors placeholder:text-[#a1a1a1]"
              style={{ borderColor: search ? "#27731e" : "#c0cab8" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                aria-label="Clear search"
              >
                <XCircle size={16} style={{ color: "#a1a1a1" }} />
              </button>
            )}
          </div>

          {/* Role filter */}
          <div className="w-[160px]">
            <CustomSelect
              value={roleFilter}
              onChange={setRoleFilter}
              options={roleOptions}
            />
          </div>

          {/* Status filter */}
          <div className="w-[160px]">
            <CustomSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
            />
          </div>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr style={{ borderBottom: "2px solid #f0f0f0" }}>
                  {["User", "Role", "Department", "Status", "Last Login", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 font-body text-[11px] font-semibold uppercase tracking-[0.6px] whitespace-nowrap"
                      style={{ color: "#a1a1a1" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState />
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const lastLogin = user.sessions[0]?.createdAt;
                    const isDeactivating = deactivateUser.isPending;

                    return (
                      <motion.tr
                        key={user.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b transition-colors hover:bg-[#fafafa]"
                        style={{ borderColor: "#f0f0f0" }}
                      >
                        {/* User cell — avatar + name + email */}
                        <td className="px-4 py-3 min-w-[220px]">
                          <div className="flex items-center gap-3">
                            <Avatar name={user.name} role={user.role} />
                            <div>
                              <p className="font-body font-semibold text-[#1a1c1c] text-[14px] leading-snug">
                                {user.name}
                              </p>
                              <p className="font-body text-[12px]" style={{ color: "#a1a1a1" }}>
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          <RoleBadge role={user.role} />
                        </td>

                        {/* Department — admin only */}
                        <td className="px-4 py-3">
                          <span className="font-body text-[13px]" style={{ color: "#40493c" }}>
                            {user.adminProfile?.department ?? (
                              <span style={{ color: "#c0cab8" }}>—</span>
                            )}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusDot banned={user.banned} />
                        </td>

                        {/* Last login */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-body text-[12px]" style={{ color: "#a1a1a1" }}>
                            {relativeTime(lastLogin)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* Edit */}
                            <button
                              onClick={() => openEditDrawer(user)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#e8fce3]"
                              style={{ color: "#27731e" }}
                              aria-label={`Edit ${user.name}`}
                            >
                              <Pencil size={16} />
                            </button>

                            {/* Ban / Deactivate toggle */}
                            <button
                              onClick={() => deactivateUser.mutate(user.id)}
                              disabled={isDeactivating}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#fee2e2] disabled:opacity-50"
                              style={{ color: user.banned ? "#a1a1a1" : "#dc2626" }}
                              aria-label={user.banned ? "User is already banned" : `Deactivate ${user.name}`}
                              title={user.banned ? "Already banned" : "Deactivate / ban"}
                            >
                              <UserX size={16} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Result count footer */}
          {!isLoading && users.length > 0 && (
            <div
              className="px-6 py-3 border-t font-body text-[13px]"
              style={{ borderColor: "#f0f0f0", color: "#a1a1a1" }}
            >
              Showing {users.length} of {total} users
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Slide-over drawer
      ------------------------------------------------------------------ */}
      <UserDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        editing={editingUser}
        form={form}
        onFormChange={handleFormChange}
        onSubmit={handleSubmit}
        isPending={isPending}
        newPasswordBanner={newPasswordBanner}
        onClearBanner={() => setNewPasswordBanner(null)}
        isResettingPassword={resetPassword.isPending}
        onResetPassword={() => {
          if (editingUser) resetPassword.mutate(editingUser.id);
        }}
      />
    </div>
  );
}
