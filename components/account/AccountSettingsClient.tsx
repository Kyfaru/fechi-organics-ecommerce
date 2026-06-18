"use client";

import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { useSession } from "@/lib/auth-client";
import { AccountLayout } from "@/components/account/AccountLayout";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordChecklist, { checkRequirements } from "@/components/auth/PasswordChecklist";
import CountrySelect from "@/components/auth/CountrySelect";
import PhoneInput from "@/components/auth/PhoneInput";
import { toast } from "@/lib/toast";
import type { Value } from "react-phone-number-input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationPrefs {
  emailUpdates: boolean;
  orderStatus: boolean;
  promotions: boolean;
}

const NOTIF_STORAGE_KEY = "fechi-notifications";

const DEFAULT_NOTIFS: NotificationPrefs = {
  emailUpdates: true,
  orderStatus: true,
  promotions: false,
};

// ---------------------------------------------------------------------------
// Helper: derive initials
// ---------------------------------------------------------------------------
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-[16px] border border-[#e2e2e2] dark:border-gray-700 p-6">
      <div className="mb-5">
        <h2 className="font-heading font-bold text-[18px] text-[#1a1c1c] dark:text-white">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[#40493c] dark:text-gray-400 text-[14px] mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle switch component
// ---------------------------------------------------------------------------
function ToggleSwitch({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 cursor-pointer py-3">
      <div className="flex-1">
        <p className="text-[15px] font-medium text-[#1a1c1c] dark:text-white">{label}</p>
        {description && (
          <p className="text-[13px] text-[#40493c] dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="relative shrink-0">
        <input
          id={id}
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={[
            "w-11 h-6 rounded-full transition-colors duration-200",
            checked ? "bg-[#27731e]" : "bg-gray-200 dark:bg-gray-700",
          ].join(" ")}
        />
        <div
          className={[
            "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * AccountSettingsClient
 *
 * Three sections:
 *   1. Profile — editable user fields, PATCH /api/users/me
 *   2. Change Password — via authClient.changePassword
 *   3. Notifications — localStorage only (v1)
 */
export function AccountSettingsClient() {
  const { data: session } = useSession();
  const user = session?.user;

  // ---- Profile form state ----
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState<Value | undefined>(undefined);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // ---- Password form state ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // ---- Notification prefs ----
  const [notifs, setNotifs] = useState<NotificationPrefs>(DEFAULT_NOTIFS);

  // Pre-fill profile from session
  useEffect(() => {
    if (!user) return;
    const parts = (user.name ?? "").split(" ");
    // Better Auth stores additionalFields on the session user object
    const u = user as typeof user & {
      firstName?: string;
      lastName?: string;
      phone?: string;
      country?: string;
      city?: string;
    };
    setFirstName(u.firstName ?? parts[0] ?? "");
    setLastName(u.lastName ?? parts.slice(1).join(" ") ?? "");
    setPhone((u.phone ?? "") as Value | undefined);
    setCountry(u.country ?? "");
    setCity(u.city ?? "");
  }, [user]);

  // Load notification prefs from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
      if (raw) setNotifs(JSON.parse(raw) as NotificationPrefs);
    } catch {
      // ignore parse errors
    }
  }, []);

  // ---- Profile save ----
  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone, city, country }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json?.error?.message ?? "Failed to update profile.");
      } else {
        toast.success("Profile updated.");
      }
    } catch (err) {
      console.error("[settings] Profile save error", err);
      toast.error("Network error — please try again.");
    } finally {
      setProfileSaving(false);
    }
  }

  // ---- Password save ----
  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    setPasswordSubmitted(true);
    setPasswordError("");

    const reqs = checkRequirements(newPassword);
    const allMet = reqs.every((r) => r.met);

    if (!allMet) {
      setPasswordError("New password does not meet all requirements.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      // Better Auth's /change-password endpoint — the client SDK does not
      // expose this method directly, so we call the REST endpoint.
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json?.message ?? json?.error ?? "Failed to change password.");
      } else {
        toast.success("Password changed.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordSubmitted(false);
      }
    } catch (err) {
      console.error("[settings] Password change error", err);
      toast.error("Failed to change password — please try again.");
    } finally {
      setPasswordSaving(false);
    }
  }

  // ---- Notification toggle ----
  function handleNotifChange(key: keyof NotificationPrefs, value: boolean) {
    const updated = { ...notifs, [key]: value };
    setNotifs(updated);
    try {
      localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // localStorage not available (SSR or private mode)
    }
  }

  const initials = getInitials(user?.name ?? "U");

  return (
    <AccountLayout>
      <div className="px-4 md:px-8 py-8 max-w-[760px]">
        <div className="mb-8">
          <h1 className="font-heading font-bold text-[28px] text-[#1a1c1c] dark:text-white">
            Account Settings
          </h1>
          <p className="text-[#40493c] dark:text-gray-400 text-[15px] mt-1">
            Manage your profile, security, and preferences.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {/* ---------------------------------------------------------------- */}
          {/* Section 1 — Profile                                              */}
          {/* ---------------------------------------------------------------- */}
          <SectionCard
            title="Profile"
            subtitle="Update your personal information"
          >
            {/* Avatar + name block */}
            <div className="flex items-center gap-4 mb-6">
              <div
                aria-hidden="true"
                className="w-20 h-20 rounded-full bg-[#27731e] flex items-center justify-center shrink-0"
              >
                <span className="text-white font-bold text-[24px] leading-none">
                  {initials}
                </span>
              </div>
              <div>
                <p className="font-semibold text-[#1a1c1c] dark:text-white text-[17px]">
                  {user?.name ?? ""}
                </p>
                <p className="text-[#40493c] dark:text-gray-400 text-[14px] mt-0.5">
                  {user?.email}
                </p>
              </div>
            </div>

            <form onSubmit={handleProfileSave}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  autoComplete="given-name"
                />
                <FormInput
                  label="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  autoComplete="family-name"
                />

                {/* Email — read-only */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold tracking-widest uppercase text-[#40493c]">
                    Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={user?.email ?? ""}
                      readOnly
                      className="w-full px-4 py-3 pr-10 text-sm text-[#1a1c1c] bg-gray-50 dark:bg-gray-800 dark:text-gray-400 rounded-[20px] border border-[#c0cab8] dark:border-gray-600 outline-none cursor-not-allowed"
                      aria-label="Email address (cannot be changed)"
                    />
                    <Icon
                      icon="mdi:lock-outline"
                      width={16}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#40493c] dark:text-gray-500"
                    />
                  </div>
                  <p className="text-[11px] text-[#40493c] dark:text-gray-500 px-1">
                    Email cannot be changed
                  </p>
                </div>

                {/* Phone */}
                <PhoneInput
                  label="Phone Number"
                  value={phone}
                  onChange={setPhone}
                />

                {/* Country */}
                <CountrySelect
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />

                {/* City */}
                <FormInput
                  label="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Nairobi"
                  autoComplete="address-level2"
                />
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="inline-flex items-center gap-2 bg-[#27731e] hover:bg-[#045a03] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] px-6 py-3 rounded-full transition-colors duration-150"
                >
                  {profileSaving && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          </SectionCard>

          {/* ---------------------------------------------------------------- */}
          {/* Section 2 — Change Password                                      */}
          {/* ---------------------------------------------------------------- */}
          <SectionCard title="Change Password">
            <form onSubmit={handlePasswordSave}>
              <div className="flex flex-col gap-4">
                <PasswordInput
                  label="Current Password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <div>
                  <PasswordInput
                    label="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(newPassword.length > 0)}
                    autoComplete="new-password"
                  />
                  <PasswordChecklist
                    password={newPassword}
                    visible={passwordFocused || newPassword.length > 0}
                    submitted={passwordSubmitted}
                  />
                </div>
                <PasswordInput
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  error={
                    confirmPassword && newPassword !== confirmPassword
                      ? "Passwords do not match"
                      : undefined
                  }
                  autoComplete="new-password"
                />

                {passwordError && (
                  <p className="text-sm text-red-500 flex items-center gap-1.5">
                    <Icon icon="mdi:alert-circle-outline" width={16} />
                    {passwordError}
                  </p>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="inline-flex items-center gap-2 bg-[#27731e] hover:bg-[#045a03] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] px-6 py-3 rounded-full transition-colors duration-150"
                >
                  {passwordSaving && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  Update Password
                </button>
              </div>
            </form>
          </SectionCard>

          {/* ---------------------------------------------------------------- */}
          {/* Section 3 — Notifications                                        */}
          {/* ---------------------------------------------------------------- */}
          <SectionCard
            title="Notifications"
            subtitle="Choose what you hear from us"
          >
            <div className="divide-y divide-[#e2e2e2] dark:divide-gray-700">
              <ToggleSwitch
                id="notif-email"
                label="Email updates"
                description="Receive news, tips, and announcements via email"
                checked={notifs.emailUpdates}
                onChange={(v) => handleNotifChange("emailUpdates", v)}
              />
              <ToggleSwitch
                id="notif-orders"
                label="Order status notifications"
                description="Get notified when your order status changes"
                checked={notifs.orderStatus}
                onChange={(v) => handleNotifChange("orderStatus", v)}
              />
              <ToggleSwitch
                id="notif-promos"
                label="Promotions & offers"
                description="Hear about sales, discounts, and exclusive deals"
                checked={notifs.promotions}
                onChange={(v) => handleNotifChange("promotions", v)}
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </AccountLayout>
  );
}
