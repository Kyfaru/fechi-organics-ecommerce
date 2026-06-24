"use client";

/**
 * AdminProfileClient — Admin personal profile page
 *
 * 4 tabs:
 *  1. Profile     — avatar, name, phone, fullName (adminProfile), department
 *  2. Preferences — theme (Light/Dark/System) + table density toggle
 *  3. Notifications — personal notification overrides (localStorage)
 *  4. Password    — current password + new password with strength meter
 *
 * Data: GET /api/admin/profile → { user, adminProfile }
 * Save: PATCH /api/admin/profile { name, phone, fullName, department }
 *       PATCH /api/admin/profile/password { currentPassword, newPassword }
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Settings, Bell, Lock, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { toast } from "@/lib/toast";
import Switch from "@/components/ui/Switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  twoFactorEnabled: boolean;
  adminProfile: {
    fullName: string;
    department: string | null;
    isActive: boolean;
  } | null;
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------
const inputCls = "w-full h-10 px-3 rounded-[8px] border border-(--neutral-300) dark:border-(--dark-border) font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) bg-white dark:bg-(--dark-surface) outline-none focus:border-(--green-600) transition-colors placeholder:text-(--neutral-400)";
const textareaCls = "w-full px-3 py-2.5 rounded-[8px] border border-(--neutral-300) dark:border-(--dark-border) font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) bg-white dark:bg-(--dark-surface) outline-none focus:border-(--green-600) transition-colors resize-none placeholder:text-(--neutral-400)";

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text)">{label}</label>
      {children}
      {description && <p className="font-dm text-[12px] text-(--neutral-400)">{description}</p>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6 ${className}`}>
      {children}
    </div>
  );
}

function SaveBtn({ onClick, saving, label = "Save Changes" }: { onClick: () => void; saving: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="h-10 px-6 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60"
    >
      {saving ? "Saving…" : label}
    </button>
  );
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Password strength meter
// ---------------------------------------------------------------------------
function getStrength(password: string): { level: number; label: string; color: string } {
  if (!password) return { level: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++;

  const map: Record<number, { label: string; color: string }> = {
    1: { label: "Weak",   color: "bg-(--danger)"   },
    2: { label: "Fair",   color: "bg-(--gold-500)"  },
    3: { label: "Good",   color: "bg-(--info)"      },
    4: { label: "Strong", color: "bg-(--success)"   },
  };
  return { level: score, ...(map[score] ?? { label: "", color: "" }) };
}

function StrengthMeter({ password }: { password: string }) {
  const { level, label, color } = getStrength(password);
  if (!password) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= level ? color : "bg-(--neutral-200)"}`}
          />
        ))}
      </div>
      {label && (
        <p className={`font-dm text-[12px] font-medium ${
          level === 1 ? "text-(--danger)" :
          level === 2 ? "text-(--gold-700)" :
          level === 3 ? "text-(--info)" :
          "text-(--success)"
        }`}>
          {label} password
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Profile
// ---------------------------------------------------------------------------
function ProfileTab({ user, saving, onSave }: { user: AdminUser; saving: boolean; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    name:       user.name ?? "",
    phone:      user.phone ?? "",
    fullName:   user.adminProfile?.fullName ?? user.name ?? "",
    department: user.adminProfile?.department ?? "",
  });

  function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required."); return; }
    onSave(form);
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <Card>
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 rounded-full bg-(--green-200) text-(--green-800) flex items-center justify-center font-syne text-[28px] font-bold shrink-0">
            {getInitials(user.name ?? "A")}
          </div>
          <div className="flex-1">
            <div className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">{user.name}</div>
            <div className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted) mt-0.5">{user.email}</div>
            <button
              onClick={() => toast.info("Photo upload coming soon — wire to /api/admin/upload")}
              className="mt-3 h-8 px-4 rounded-[6px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Upload photo
            </button>
          </div>
        </div>
      </Card>

      {/* Profile fields */}
      <Card>
        <div className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-5">Personal Information</div>
        <div className="space-y-4">
          <Field label="Display name" description="Shown in the admin panel header and activity logs">
            <input className={inputCls} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Your full name" />
          </Field>
          <Field label="Phone number">
            <input type="tel" className={inputCls} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+254 700 000 000" />
          </Field>
          <div className="border-t border-(--neutral-100) dark:border-(--dark-border) pt-4">
            <div className="font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-400) mb-3">Admin Profile</div>
            <div className="space-y-4">
              <Field label="Full name" description="Your legal name — used in audit logs and invoices">
                <input className={inputCls} value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} placeholder="Jane Mwangi" />
              </Field>
              <Field label="Department" description="e.g. Operations, Marketing, Technology">
                <input className={inputCls} value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} placeholder="Operations" />
              </Field>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <SaveBtn onClick={handleSave} saving={saving} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Preferences
// ---------------------------------------------------------------------------
type Theme = "light" | "dark" | "system";
type Density = "comfortable" | "compact";

const PREF_KEY = "fechi-admin-prefs";

function PreferencesTab() {
  const [theme, setTheme] = useState<Theme>("system");
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}");
      if (saved.theme) setTheme(saved.theme);
      if (saved.density) setDensity(saved.density);
    } catch { /* use defaults */ }
  }, []);

  function applyTheme(t: Theme) {
    setTheme(t);
    if (t === "dark") document.documentElement.classList.add("dark");
    else if (t === "light") document.documentElement.classList.remove("dark");
    else {
      // System: match prefers-color-scheme
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    }
    localStorage.setItem(PREF_KEY, JSON.stringify({ theme: t, density }));
    toast.success(`Theme set to ${t}.`);
  }

  function applyDensity(d: Density) {
    setDensity(d);
    localStorage.setItem(PREF_KEY, JSON.stringify({ theme, density: d }));
    toast.success(`Table density set to ${d}.`);
  }

  const themeOptions: { value: Theme; label: string; desc: string }[] = [
    { value: "light",  label: "Light",  desc: "Bright background, default look" },
    { value: "dark",   label: "Dark",   desc: "Dark background, easier on the eyes" },
    { value: "system", label: "System", desc: "Follows your OS preference" },
  ];

  const densityOptions: { value: Density; label: string; desc: string }[] = [
    { value: "comfortable", label: "Comfortable", desc: "More breathing room between rows" },
    { value: "compact",     label: "Compact",     desc: "Fits more rows per screen" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-5">Appearance</div>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => applyTheme(opt.value)}
              className={`flex flex-col items-start gap-1 p-4 rounded-[10px] border-2 text-left transition-all ${
                theme === opt.value
                  ? "border-(--green-800) bg-(--green-50)"
                  : "border-(--neutral-200) dark:border-(--dark-border) hover:border-(--neutral-300)"
              }`}
            >
              <span className="font-dm text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">{opt.label}</span>
              <span className="font-dm text-[12px] text-(--neutral-400)">{opt.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-5">Table Density</div>
        <div className="grid grid-cols-2 gap-3">
          {densityOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => applyDensity(opt.value)}
              className={`flex flex-col items-start gap-1 p-4 rounded-[10px] border-2 text-left transition-all ${
                density === opt.value
                  ? "border-(--green-800) bg-(--green-50)"
                  : "border-(--neutral-200) dark:border-(--dark-border) hover:border-(--neutral-300)"
              }`}
            >
              <span className="font-dm text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">{opt.label}</span>
              <span className="font-dm text-[12px] text-(--neutral-400)">{opt.desc}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Notifications (personal overrides — localStorage)
// ---------------------------------------------------------------------------
const NOTIF_KEY = "fechi-admin-personal-notifs";

const PERSONAL_NOTIFS = [
  { key: "pn_new_order",        label: "New order placed",         description: "Notify me when a new order is placed" },
  { key: "pn_order_shipped",    label: "Order shipped",            description: "Notify me when an order ships" },
  { key: "pn_low_stock",        label: "Low stock alert",          description: "Alert when a product drops below 10 units" },
  { key: "pn_new_customer",     label: "New customer signup",      description: "Notify when a new customer registers" },
  { key: "pn_staff_joined",     label: "Staff invitation accepted",description: "Notify when someone accepts my invite" },
  { key: "pn_daily_digest",     label: "Daily digest",             description: "Receive a 9am summary of store activity" },
] as const;

function NotificationsTab() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(PERSONAL_NOTIFS.map((n) => [n.key, true]))
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(NOTIF_KEY) ?? "{}");
      setPrefs((p) => ({ ...p, ...saved }));
    } catch { /* use defaults */ }
  }, []);

  function handleSave() {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs));
    toast.success("Notification preferences saved.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">Personal Notifications</div>
        <p className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted) mb-5">
          These override the store-level notification settings for your account only.
        </p>
        <div className="divide-y divide-(--neutral-100) dark:divide-(--dark-border)">
          {PERSONAL_NOTIFS.map((item) => (
            <div key={item.key} className="flex items-center justify-between py-4">
              <div>
                <div className="font-dm text-[14px] font-medium text-(--neutral-900) dark:text-(--dark-text)">{item.label}</div>
                <div className="font-dm text-[12px] text-(--neutral-400) mt-0.5">{item.description}</div>
              </div>
              <Switch
                checked={prefs[item.key]}
                onChange={(v) => setPrefs((p) => ({ ...p, [item.key]: v }))}
              />
            </div>
          ))}
        </div>
      </Card>
      <div className="flex justify-end">
        <SaveBtn onClick={handleSave} saving={false} label="Save Preferences" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Password
// ---------------------------------------------------------------------------
function PasswordTab() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext,    setShowNext]    = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!form.current) e.current = "Current password is required.";
    if (form.next.length < 8) e.next = "New password must be at least 8 characters.";
    if (form.next !== form.confirm) e.confirm = "Passwords do not match.";
    if (form.next && form.current === form.next) e.next = "New password must differ from current.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);

    try {
      const res = await fetch("/api/admin/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Password update failed.");
      toast.success("Password updated successfully.");
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update password.";
      if (msg.toLowerCase().includes("current") || msg.toLowerCase().includes("incorrect")) {
        setErrors({ current: "Current password is incorrect." });
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  function PwInput({ id, value, show, onToggle, onChange, placeholder, error }: {
    id: string; value: string; show: boolean; onToggle: () => void;
    onChange: (v: string) => void; placeholder: string; error?: string;
  }) {
    return (
      <div className="flex flex-col gap-1">
        <div className="relative">
          <input
            id={id}
            type={show ? "text" : "password"}
            className={`${inputCls} pr-10 ${error ? "border-(--danger)" : ""}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete={id === "current" ? "current-password" : "new-password"}
          />
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-400) hover:text-(--neutral-600)"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && <p className="font-dm text-[12px] text-(--danger)">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-5">Change Password</div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Current password">
            <PwInput
              id="current"
              value={form.current}
              show={showCurrent}
              onToggle={() => setShowCurrent((s) => !s)}
              onChange={(v) => setForm((p) => ({ ...p, current: v }))}
              placeholder="Your current password"
              error={errors.current}
            />
          </Field>

          <Field label="New password">
            <PwInput
              id="new"
              value={form.next}
              show={showNext}
              onToggle={() => setShowNext((s) => !s)}
              onChange={(v) => setForm((p) => ({ ...p, next: v }))}
              placeholder="At least 8 characters"
              error={errors.next}
            />
            {form.next && <StrengthMeter password={form.next} />}
          </Field>

          <Field label="Confirm new password">
            <div>
              <input
                type={showNext ? "text" : "password"}
                className={`${inputCls} ${errors.confirm ? "border-(--danger)" : ""}`}
                value={form.confirm}
                onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
                placeholder="Repeat the new password"
                autoComplete="new-password"
              />
              {errors.confirm && <p className="font-dm text-[12px] text-(--danger) mt-1">{errors.confirm}</p>}
            </div>
          </Field>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-6 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60"
            >
              {saving ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const TABS = [
  { id: "profile",       label: "Profile",       icon: User     },
  { id: "preferences",   label: "Preferences",   icon: Settings },
  { id: "notifications", label: "Notifications", icon: Bell     },
  { id: "password",      label: "Password",      icon: Lock     },
];

export function AdminProfileClient() {
  const [activeTab, setActiveTab] = useState("profile");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: () =>
      fetch("/api/admin/profile").then((r) => r.json()).then((j) => j.data?.user ?? null),
  });

  const user: AdminUser | null = data ?? null;

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Save failed.");
    },
    onSuccess: () => {
      toast.success("Profile updated.");
      qc.invalidateQueries({ queryKey: ["admin-profile"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save profile.");
    },
  });

  function renderTab() {
    if (isLoading || !user) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) h-24 animate-pulse" />
          ))}
        </div>
      );
    }

    switch (activeTab) {
      case "profile":
        return (
          <ProfileTab
            user={user}
            saving={saveMutation.isPending}
            onSave={(data) => saveMutation.mutate(data)}
          />
        );
      case "preferences":
        return <PreferencesTab />;
      case "notifications":
        return <NotificationsTab />;
      case "password":
        return <PasswordTab />;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader title="My Profile" description="Manage your personal admin account settings" />

      <div className="flex gap-6 px-6 pb-6">
        {/* Left sidebar */}
        <nav className="w-[200px] shrink-0 space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 h-10 px-3 rounded-[8px] font-dm text-[14px] text-left transition-colors ${
                activeTab === tab.id
                  ? "bg-(--green-50) text-(--green-800) font-medium"
                  : "text-(--neutral-700) dark:text-(--dark-muted) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border)"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right panel */}
        <div className="flex-1 max-w-[580px]">
          {renderTab()}
        </div>
      </div>
    </div>
  );
}
