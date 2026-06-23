"use client";

/**
 * AdminRolesClient — Roles & Permissions page
 *
 * Static permissions matrix showing which roles can perform which actions.
 * Admin column is immutable (always all-on).
 * Other columns are interactive toggles (local state) — "Save Changes" saves to localStorage
 * for persistence within the session.
 *
 * TODO: When a DB-backed roles system is implemented, wire the save button to PATCH /api/admin/roles
 */

import { useState, useEffect } from "react";
import { Check, X, Save } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Static permissions matrix definition
// ---------------------------------------------------------------------------
const PERMISSIONS = [
  { key: "view_dashboard",    label: "View Dashboard",     description: "Access the admin overview and analytics" },
  { key: "manage_products",   label: "Manage Products",    description: "Create, edit, and delete products" },
  { key: "manage_orders",     label: "Manage Orders",      description: "Process, update, and refund orders" },
  { key: "manage_customers",  label: "Manage Customers",   description: "View and manage customer accounts" },
  { key: "manage_staff",      label: "Manage Staff",       description: "Invite, edit, and remove staff members" },
  { key: "view_analytics",    label: "View Analytics",     description: "Access sales reports and data exports" },
  { key: "manage_content",    label: "Manage Content",     description: "Edit blog posts, FAQs, and homepage sections" },
  { key: "manage_settings",   label: "Manage Settings",    description: "Change store-wide configuration" },
  { key: "export_data",       label: "Export Data",        description: "Download orders, customers, and reports" },
  { key: "manage_finance",    label: "Manage Finance",     description: "View transactions and payment settings" },
] as const;

type PermKey = (typeof PERMISSIONS)[number]["key"];

const ROLES = ["Admin", "Manager", "Inventory", "Support", "Viewer"] as const;
type RoleKey = (typeof ROLES)[number];

// Default permission matrix (Admin always all-true, others reasonable defaults)
const DEFAULT_MATRIX: Record<RoleKey, Record<PermKey, boolean>> = {
  Admin: {
    view_dashboard:   true,
    manage_products:  true,
    manage_orders:    true,
    manage_customers: true,
    manage_staff:     true,
    view_analytics:   true,
    manage_content:   true,
    manage_settings:  true,
    export_data:      true,
    manage_finance:   true,
  },
  Manager: {
    view_dashboard:   true,
    manage_products:  true,
    manage_orders:    true,
    manage_customers: true,
    manage_staff:     false,
    view_analytics:   true,
    manage_content:   true,
    manage_settings:  false,
    export_data:      true,
    manage_finance:   false,
  },
  Inventory: {
    view_dashboard:   true,
    manage_products:  true,
    manage_orders:    false,
    manage_customers: false,
    manage_staff:     false,
    view_analytics:   false,
    manage_content:   false,
    manage_settings:  false,
    export_data:      false,
    manage_finance:   false,
  },
  Support: {
    view_dashboard:   true,
    manage_products:  false,
    manage_orders:    true,
    manage_customers: true,
    manage_staff:     false,
    view_analytics:   false,
    manage_content:   false,
    manage_settings:  false,
    export_data:      false,
    manage_finance:   false,
  },
  Viewer: {
    view_dashboard:   true,
    manage_products:  false,
    manage_orders:    false,
    manage_customers: false,
    manage_staff:     false,
    view_analytics:   true,
    manage_content:   false,
    manage_settings:  false,
    export_data:      false,
    manage_finance:   false,
  },
};

const STORAGE_KEY = "fechi-admin-role-matrix";

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------
function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange?.(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      className={`relative w-10 h-5.5 rounded-full transition-colors ${
        checked ? "bg-(--green-600)" : "bg-(--neutral-200)"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      style={{ width: 40, height: 22 }}
    >
      <span
        className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[20px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminRolesClient() {
  const [matrix, setMatrix] = useState(DEFAULT_MATRIX);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Restore saved matrix from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMatrix({ ...DEFAULT_MATRIX, ...parsed, Admin: DEFAULT_MATRIX.Admin });
      }
    } catch {
      // Ignore parse errors — use defaults
    }
  }, []);

  function toggle(role: RoleKey, perm: PermKey) {
    if (role === "Admin") return; // Admin is immutable
    setMatrix((prev) => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role][perm] },
    }));
    setDirty(true);
  }

  function handleSave() {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
      toast.success("Roles saved", { message: "Permissions matrix updated." });
      setDirty(false);
    } catch {
      toast.error("Failed to save roles.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader
        title="Roles & Permissions"
        breadcrumbs={[
          { label: "Staff", href: "/admin/staff" },
          { label: "Roles", href: "/admin/staff/roles" },
        ]}
        description="Define what each role can do across the admin panel"
        action={
          dirty ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              <Save size={15} />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          ) : null
        }
      />

      <div className="px-6 pb-6">
        <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) overflow-hidden">
          {/* Note banner */}
          <div className="px-6 py-3 bg-(--gold-50) border-b border-(--gold-200) flex items-center gap-2">
            <span className="font-dm text-[13px] text-(--gold-700)">
              Admin permissions are immutable and cannot be changed. Other roles can be customised below.
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg)">
                  <th className="px-6 py-4 text-left font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500) w-64">
                    Permission
                  </th>
                  {ROLES.map((role) => (
                    <th
                      key={role}
                      className={`px-4 py-4 text-center font-dm text-[12px] font-medium uppercase tracking-wider ${
                        role === "Admin" ? "text-(--green-800)" : "text-(--neutral-500)"
                      }`}
                    >
                      {role}
                      {role === "Admin" && (
                        <span className="block text-[10px] normal-case tracking-normal text-(--green-600) font-normal mt-0.5">
                          immutable
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm, idx) => (
                  <tr
                    key={perm.key}
                    className={`border-b border-(--neutral-200) dark:border-(--dark-border) ${
                      idx % 2 === 0 ? "" : "bg-(--neutral-50)/50 dark:bg-(--dark-bg)/30"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-dm text-[14px] font-medium text-(--neutral-900) dark:text-(--dark-text)">
                        {perm.label}
                      </div>
                      <div className="font-dm text-[12px] text-(--neutral-400) mt-0.5">
                        {perm.description}
                      </div>
                    </td>
                    {ROLES.map((role) => {
                      const enabled = matrix[role][perm.key];
                      return (
                        <td key={role} className="px-4 py-4">
                          <div className="flex flex-col items-center gap-2">
                            <Toggle
                              checked={enabled}
                              disabled={role === "Admin"}
                              onChange={() => toggle(role, perm.key)}
                            />
                            {/* Visual indicator below toggle */}
                            {enabled ? (
                              <Check size={12} className="text-(--success)" />
                            ) : (
                              <X size={12} className="text-(--neutral-300)" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
