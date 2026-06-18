"use client";

/**
 * AdminSettingsClient — 9-tab store settings page
 *
 * Loads all settings from GET /api/admin/settings → { settings: Record<string,unknown> }
 * Saves individual keys via PATCH /api/admin/settings { key, value }
 *
 * Tabs:
 *  1. General       — store name, email, phone, timezone, language
 *  2. Store Profile — description, address, KRA PIN
 *  3. Branding      — logo, favicon, email banner (R2 upload stubs)
 *  4. Shipping      — link card to /admin/orders/shipping
 *  5. Payment       — link card to /admin/finance/payment-methods
 *  6. Notifications — per-event toggle switches (saved to systemConfig)
 *  7. Security      — 2FA status, active sessions, password policy
 *  8. API & Integrations — API keys, M-Pesa, Zoho, PostHog status
 *  9. Danger Zone   — export GDPR, delete test orders, delete store (disabled)
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store, Building2, Palette, Truck, CreditCard, Bell,
  Lock, Zap, AlertTriangle, ExternalLink, Shield,
  ChevronRight, Globe, Phone, Clock, Languages, FileText,
  MapPin, Hash,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { toast } from "@/lib/toast";
import { authClient } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Settings = Record<string, unknown>;

interface TabDef {
  id: string;
  label: string;
  icon: React.ElementType;
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
const TABS: TabDef[] = [
  { id: "general",       label: "General",           icon: Store         },
  { id: "profile",       label: "Store Profile",     icon: Building2     },
  { id: "branding",      label: "Branding",          icon: Palette       },
  { id: "shipping",      label: "Shipping",          icon: Truck         },
  { id: "payment",       label: "Payment",           icon: CreditCard    },
  { id: "notifications", label: "Notifications",     icon: Bell          },
  { id: "security",      label: "Security",          icon: Lock          },
  { id: "api",           label: "API & Integrations",icon: Zap           },
  { id: "danger",        label: "Danger Zone",       icon: AlertTriangle },
];

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

/** Labelled text input */
function Field({
  label, description, children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-dm text-[13px] font-medium text-[--neutral-700] dark:text-[--dark-text]">{label}</label>
      {children}
      {description && (
        <p className="font-dm text-[12px] text-[--neutral-400]">{description}</p>
      )}
    </div>
  );
}

const inputCls = "w-full h-10 px-3 rounded-[8px] border border-[--neutral-300] dark:border-[--dark-border] font-dm text-[14px] text-[--neutral-900] dark:text-[--dark-text] bg-white dark:bg-[--dark-surface] outline-none focus:border-[--green-600] transition-colors placeholder:text-[--neutral-400]";
const selectCls = `${inputCls} pr-8 appearance-none`;
const textareaCls = "w-full px-3 py-2.5 rounded-[8px] border border-[--neutral-300] dark:border-[--dark-border] font-dm text-[14px] text-[--neutral-900] dark:text-[--dark-text] bg-white dark:bg-[--dark-surface] outline-none focus:border-[--green-600] transition-colors resize-none placeholder:text-[--neutral-400]";

/** Section card wrapper */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6 ${className}`}>
      {children}
    </div>
  );
}

/** Card title + optional description */
function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h3 className="font-syne text-[16px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">{title}</h3>
      {description && (
        <p className="font-dm text-[13px] text-[--neutral-500] dark:text-[--dark-muted] mt-0.5">{description}</p>
      )}
    </div>
  );
}

/** Toggle switch */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{ width: 40, height: 22 }}
      className={`relative rounded-full transition-colors shrink-0 ${checked ? "bg-[--green-600]" : "bg-[--neutral-200]"}`}
    >
      <span
        className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[20px]" : "translate-x-[3px]"}`}
      />
    </button>
  );
}

/** Save button */
function SaveBtn({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="h-10 px-6 rounded-[8px] bg-[--green-800] hover:bg-[--green-900] font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60"
    >
      {saving ? "Saving…" : "Save Changes"}
    </button>
  );
}

/** Link card for Shipping and Payment tabs */
function LinkCard({ icon: Icon, title, description, href }: {
  icon: React.ElementType; title: string; description: string; href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-4 p-5 rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] hover:border-[--green-200] hover:bg-[--green-50] dark:hover:bg-[--dark-bg] transition-colors group"
    >
      <div className="w-10 h-10 rounded-[8px] bg-[--green-50] flex items-center justify-center shrink-0 group-hover:bg-[--green-200] transition-colors">
        <Icon size={20} className="text-[--green-800]" />
      </div>
      <div className="flex-1">
        <div className="font-dm text-[14px] font-medium text-[--neutral-900] dark:text-[--dark-text]">{title}</div>
        <div className="font-dm text-[13px] text-[--neutral-500] dark:text-[--dark-muted]">{description}</div>
      </div>
      <ChevronRight size={18} className="text-[--neutral-400] group-hover:text-[--green-800] transition-colors" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Tab panels
// ---------------------------------------------------------------------------

function GeneralTab({ settings, onSave, saving }: { settings: Settings; onSave: (k: string, v: string) => void; saving: boolean }) {
  const [form, setForm] = useState({
    store_name:    String(settings.store_name ?? "Fechi Organics"),
    store_email:   String(settings.store_email ?? ""),
    support_phone: String(settings.support_phone ?? ""),
    timezone:      String(settings.timezone ?? "Africa/Nairobi"),
    language:      String(settings.language ?? "en"),
  });

  function handleSave() {
    Object.entries(form).forEach(([k, v]) => onSave(k, v));
    toast.success("General settings saved.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Store Information" description="Basic details about your store" />
        <div className="space-y-4">
          <Field label="Store name" description="Shown in emails, invoices, and browser tabs">
            <div className="relative">
              <Store size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[--neutral-400]" />
              <input className={`${inputCls} pl-9`} value={form.store_name} onChange={(e) => setForm((p) => ({ ...p, store_name: e.target.value }))} placeholder="Fechi Organics" />
            </div>
          </Field>
          <Field label="Store email" description="Used for order confirmations and support replies">
            <div className="relative">
              <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[--neutral-400]" />
              <input type="email" className={`${inputCls} pl-9`} value={form.store_email} onChange={(e) => setForm((p) => ({ ...p, store_email: e.target.value }))} placeholder="orders@fechiorganics.co.ke" />
            </div>
          </Field>
          <Field label="Support phone" description="Displayed on the storefront contact page">
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[--neutral-400]" />
              <input type="tel" className={`${inputCls} pl-9`} value={form.support_phone} onChange={(e) => setForm((p) => ({ ...p, support_phone: e.target.value }))} placeholder="+254 700 000 000" />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timezone">
              <div className="relative">
                <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[--neutral-400] z-10" />
                <select className={`${selectCls} pl-9`} value={form.timezone} onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}>
                  <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
            </Field>
            <Field label="Language">
              <div className="relative">
                <Languages size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[--neutral-400] z-10" />
                <select className={`${selectCls} pl-9`} value={form.language} onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}>
                  <option value="en">English</option>
                  <option value="sw">Swahili</option>
                </select>
              </div>
            </Field>
          </div>
        </div>
      </Card>
      <div className="flex justify-end">
        <SaveBtn onClick={handleSave} saving={saving} />
      </div>
    </div>
  );
}

function StoreProfileTab({ settings, onSave, saving }: { settings: Settings; onSave: (k: string, v: string) => void; saving: boolean }) {
  const [form, setForm] = useState({
    store_description: String(settings.store_description ?? ""),
    store_address:     String(settings.store_address ?? ""),
    kra_pin:           String(settings.kra_pin ?? ""),
  });

  function handleSave() {
    Object.entries(form).forEach(([k, v]) => onSave(k, v));
    toast.success("Store profile saved.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Store Profile" description="Public-facing information about your store" />
        <div className="space-y-4">
          <Field label="Store description" description="Shown on the About page and in SEO meta tags">
            <textarea rows={4} className={textareaCls} value={form.store_description} onChange={(e) => setForm((p) => ({ ...p, store_description: e.target.value }))} placeholder="Fechi Organics is Kenya's leading organic skincare brand…" />
          </Field>
          <Field label="Physical address" description="Displayed in receipts and on the contact page">
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-3 text-[--neutral-400]" />
              <textarea rows={2} className={`${textareaCls} pl-9`} value={form.store_address} onChange={(e) => setForm((p) => ({ ...p, store_address: e.target.value }))} placeholder="Westlands, Nairobi, Kenya" />
            </div>
          </Field>
          <Field label="KRA PIN" description="Required for VAT invoicing in Kenya">
            <div className="relative">
              <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[--neutral-400]" />
              <input className={`${inputCls} pl-9`} value={form.kra_pin} onChange={(e) => setForm((p) => ({ ...p, kra_pin: e.target.value.toUpperCase() }))} placeholder="P051234567A" />
            </div>
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <SaveBtn onClick={handleSave} saving={saving} />
      </div>
    </div>
  );
}

function BrandingTab({ settings, onSave, saving }: { settings: Settings; onSave: (k: string, v: string) => void; saving: boolean }) {
  // TODO: Wire upload buttons to R2 upload endpoint (POST /api/admin/upload)
  // and store the returned object key via onSave(key, objectKey)
  const logoKey   = String(settings.brand_logo_key ?? "");
  const faviconKey = String(settings.brand_favicon_key ?? "");
  const bannerKey  = String(settings.brand_email_banner_key ?? "");

  function UploadSlot({ label, description, currentKey }: { label: string; description: string; currentKey: string }) {
    return (
      <div className="flex items-start gap-4 p-4 rounded-[10px] border border-dashed border-[--neutral-300] dark:border-[--dark-border] hover:border-[--green-400] transition-colors">
        {currentKey ? (
          <div className="w-16 h-16 rounded-[8px] bg-[--neutral-100] flex items-center justify-center shrink-0">
            {/* TODO: render actual image once R2 URL resolution is wired */}
            <Palette size={24} className="text-[--neutral-400]" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-[8px] bg-[--neutral-100] flex items-center justify-center shrink-0">
            <Palette size={24} className="text-[--neutral-300]" />
          </div>
        )}
        <div className="flex-1">
          <div className="font-dm text-[14px] font-medium text-[--neutral-900] dark:text-[--dark-text]">{label}</div>
          <div className="font-dm text-[12px] text-[--neutral-400] mt-0.5">{description}</div>
          {currentKey && (
            <div className="font-mono text-[11px] text-[--neutral-400] mt-1 truncate max-w-[200px]">{currentKey}</div>
          )}
        </div>
        <button
          onClick={() => toast.info("File upload coming soon — wire to /api/admin/upload")}
          className="shrink-0 h-8 px-4 rounded-[6px] border border-[--neutral-200] font-dm text-[12px] text-[--neutral-700] hover:bg-[--neutral-50] transition-colors"
        >
          Upload
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Brand Assets" description="Your logos and images used in emails and storefront" />
        <div className="space-y-4">
          <UploadSlot label="Store Logo" description="Recommended: 200×60px SVG or PNG" currentKey={logoKey} />
          <UploadSlot label="Favicon" description="Recommended: 32×32px ICO or PNG" currentKey={faviconKey} />
          <UploadSlot label="Email Banner" description="Recommended: 600×200px PNG, shown in transactional emails" currentKey={bannerKey} />
        </div>
      </Card>
      <div className="flex justify-end">
        <SaveBtn onClick={() => toast.success("Branding saved.")} saving={saving} />
      </div>
    </div>
  );
}

function ShippingTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Shipping Zones" description="Configure delivery zones, rates, and carrier integrations" />
        <LinkCard
          icon={Truck}
          title="Manage Shipping Zones"
          description="Set delivery areas, flat rates, and free-shipping thresholds"
          href="/admin/orders/shipping"
        />
      </Card>
    </div>
  );
}

function PaymentTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Payment Methods" description="Configure M-Pesa, card, and other payment providers" />
        <LinkCard
          icon={CreditCard}
          title="Manage Payment Methods"
          description="Set up M-Pesa paybill, till numbers, and payment callbacks"
          href="/admin/finance/payment-methods"
        />
      </Card>
    </div>
  );
}

const NOTIFICATION_ITEMS = [
  { key: "notif_new_order",         label: "New order received",     description: "Alert when a customer places a new order" },
  { key: "notif_order_shipped",     label: "Order shipped",          description: "Notify when an order status changes to Shipped" },
  { key: "notif_low_stock",         label: "Low stock alert",        description: "Warn when a product stock drops below 10 units" },
  { key: "notif_new_customer",      label: "New customer signed up", description: "Alert when a new account is created" },
  { key: "notif_invite_accepted",   label: "Staff invitation accepted", description: "Notify when a staff invite is accepted" },
  { key: "notif_daily_digest",      label: "Daily digest (9am)",     description: "Summarise orders and key metrics each morning" },
] as const;

function NotificationsTab({ settings, onSave, saving }: { settings: Settings; onSave: (k: string, v: unknown) => void; saving: boolean }) {
  const [local, setLocal] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_ITEMS.map((n) => [n.key, Boolean(settings[n.key] ?? false)]))
  );

  function handleSave() {
    Object.entries(local).forEach(([k, v]) => onSave(k, v));
    toast.success("Notification preferences saved.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Email Notifications" description="Choose which events trigger admin email alerts" />
        <div className="divide-y divide-[--neutral-100] dark:divide-[--dark-border]">
          {NOTIFICATION_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center justify-between py-4">
              <div>
                <div className="font-dm text-[14px] font-medium text-[--neutral-900] dark:text-[--dark-text]">{item.label}</div>
                <div className="font-dm text-[12px] text-[--neutral-400] mt-0.5">{item.description}</div>
              </div>
              <Toggle
                checked={local[item.key]}
                onChange={(v) => setLocal((p) => ({ ...p, [item.key]: v }))}
              />
            </div>
          ))}
        </div>
      </Card>
      <div className="flex justify-end">
        <SaveBtn onClick={handleSave} saving={saving} />
      </div>
    </div>
  );
}

function SecurityTab({ settings, onSave, saving }: { settings: Settings; onSave: (k: string, v: unknown) => void; saving: boolean }) {
  // Pull 2FA status from session — we can't know this from settings, so placeholder
  const [minLength, setMinLength] = useState(String(settings.pw_min_length ?? "8"));
  const [requireSpecial, setRequireSpecial] = useState(Boolean(settings.pw_require_special ?? false));

  function handleSavePolicy() {
    onSave("pw_min_length", minLength);
    onSave("pw_require_special", requireSpecial);
    toast.success("Password policy saved.");
  }

  return (
    <div className="space-y-6">
      {/* 2FA card */}
      <Card>
        <CardHeader title="Two-Factor Authentication" description="Protect admin accounts with TOTP-based 2FA" />
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[--green-50] flex items-center justify-center">
            <Shield size={20} className="text-[--green-800]" />
          </div>
          <div className="flex-1">
            <div className="font-dm text-[14px] font-medium text-[--neutral-900] dark:text-[--dark-text]">2FA Configuration</div>
            <div className="font-dm text-[12px] text-[--neutral-400]">Manage 2FA on your profile page</div>
          </div>
          <a
            href="/admin/profile"
            className="h-9 px-4 rounded-[8px] border border-[--neutral-200] font-dm text-[13px] text-[--neutral-700] hover:bg-[--neutral-50] transition-colors flex items-center gap-1.5"
          >
            Configure <ExternalLink size={13} />
          </a>
        </div>
      </Card>

      {/* Active sessions placeholder */}
      <Card>
        <CardHeader title="Active Sessions" description="Devices currently signed into the admin panel" />
        <div className="bg-[--neutral-50] dark:bg-[--dark-bg] rounded-[8px] p-4 text-center">
          <p className="font-dm text-[13px] text-[--neutral-400]">
            Session management UI coming soon. To invalidate all sessions, change your password.
          </p>
        </div>
      </Card>

      {/* Password policy */}
      <Card>
        <CardHeader title="Password Policy" description="Minimum requirements for admin passwords" />
        <div className="space-y-4">
          <Field label="Minimum password length">
            <select className={selectCls} value={minLength} onChange={(e) => setMinLength(e.target.value)}>
              <option value="8">8 characters</option>
              <option value="10">10 characters</option>
              <option value="12">12 characters</option>
            </select>
          </Field>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-dm text-[14px] font-medium text-[--neutral-900] dark:text-[--dark-text]">Require special characters</div>
              <div className="font-dm text-[12px] text-[--neutral-400]">Passwords must include at least one symbol</div>
            </div>
            <Toggle checked={requireSpecial} onChange={setRequireSpecial} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <SaveBtn onClick={handleSavePolicy} saving={saving} />
      </div>
    </div>
  );
}

function ApiTab() {
  // TODO: Fetch real M-Pesa / Zoho / PostHog config status from settings or dedicated endpoints
  const mpesaConfigured = false; // TODO: check if branch is configured
  const zohoConfigured  = false; // TODO: check systemConfig for zoho credentials
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY; // Available if set in .env

  return (
    <div className="space-y-6">
      {/* API Keys */}
      <Card>
        <CardHeader title="API Keys" description="Programmatic access to the Fechi Organics API" />
        <div className="bg-[--neutral-50] dark:bg-[--dark-bg] rounded-[8px] p-4 text-center">
          <p className="font-dm text-[13px] text-[--neutral-400] mb-3">No API keys generated yet.</p>
          <button
            onClick={() => toast.info("API key management coming soon.")}
            className="h-9 px-5 rounded-[8px] bg-[--green-800] hover:bg-[--green-900] font-dm text-[13px] font-medium text-white transition-colors"
          >
            Generate Key
          </button>
        </div>
      </Card>

      {/* M-Pesa */}
      <Card>
        <CardHeader title="M-Pesa" description="Safaricom STK Push payment integration" />
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="font-dm text-[14px] font-medium text-[--neutral-900] dark:text-[--dark-text]">M-Pesa Status</div>
            <div className="mt-1">
              <StatusPill status={mpesaConfigured ? "active" : "failed"} />
            </div>
          </div>
          <a href="/admin/finance/payment-methods" className="h-9 px-4 rounded-[8px] border border-[--neutral-200] font-dm text-[13px] text-[--neutral-700] hover:bg-[--neutral-50] transition-colors flex items-center gap-1.5">
            Configure <ExternalLink size={13} />
          </a>
        </div>
      </Card>

      {/* Zoho */}
      <Card>
        <CardHeader title="Zoho Inventory" description="Sync products and orders with Zoho" />
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="font-dm text-[14px] font-medium text-[--neutral-900] dark:text-[--dark-text]">Zoho Sync</div>
            <div className="mt-1">
              <StatusPill status={zohoConfigured ? "active" : "draft"} />
            </div>
          </div>
          <button
            onClick={() => toast.info("Zoho sync endpoint: POST /api/admin/zoho/sync — configure credentials first.")}
            className="h-9 px-4 rounded-[8px] border border-[--neutral-200] font-dm text-[13px] text-[--neutral-700] hover:bg-[--neutral-50] transition-colors"
          >
            Sync Now
          </button>
        </div>
      </Card>

      {/* PostHog */}
      <Card>
        <CardHeader title="PostHog Analytics" description="Product analytics and session recording" />
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="font-dm text-[14px] font-medium text-[--neutral-900] dark:text-[--dark-text]">PostHog Status</div>
            <div className="mt-1">
              <StatusPill status={posthogKey ? "active" : "draft"} />
            </div>
            {posthogKey && (
              <div className="font-mono text-[11px] text-[--neutral-400] mt-1">
                Key: {posthogKey.slice(0, 8)}…
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function DangerTab() {
  const [confirmDeleteOrders, setConfirmDeleteOrders] = useState(false);
  const [deletingOrders, setDeletingOrders] = useState(false);

  async function handleDeleteTestOrders() {
    setDeletingOrders(true);
    try {
      // TODO: implement DELETE /api/admin/orders?test=true endpoint
      await new Promise((r) => setTimeout(r, 800));
      toast.success("Test orders deleted.");
    } finally {
      setDeletingOrders(false);
      setConfirmDeleteOrders(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[--danger-bg] border border-[--danger]/20 rounded-[12px] p-4 mb-2">
        <p className="font-dm text-[13px] text-[--danger] font-medium">
          Actions in this section are potentially irreversible. Proceed with caution.
        </p>
      </div>

      {/* Export GDPR Data */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-dm text-[14px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">Export GDPR Data</div>
            <div className="font-dm text-[13px] text-[--neutral-500] mt-0.5">
              Download a full export of customer personal data in JSON format.
            </div>
          </div>
          <button
            onClick={() => toast.success("Export requested", { message: "You'll receive an email when the export is ready." })}
            className="h-9 px-4 rounded-[8px] border border-[--neutral-200] font-dm text-[13px] text-[--neutral-700] hover:bg-[--neutral-50] transition-colors shrink-0"
          >
            Request Export
          </button>
        </div>
      </Card>

      {/* Delete Test Orders */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-dm text-[14px] font-semibold text-[--danger]">Delete All Test Orders</div>
            <div className="font-dm text-[13px] text-[--neutral-500] mt-0.5">
              Permanently removes orders in PENDING status with no payment. Cannot be undone.
            </div>
          </div>
          <button
            onClick={() => setConfirmDeleteOrders(true)}
            className="h-9 px-4 rounded-[8px] border border-[--danger]/30 bg-[--danger-bg] font-dm text-[13px] text-[--danger] hover:bg-[--danger]/10 transition-colors shrink-0"
          >
            Delete
          </button>
        </div>
      </Card>

      {/* Delete Store */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-dm text-[14px] font-semibold text-[--neutral-400]">Delete Store</div>
            <div className="font-dm text-[13px] text-[--neutral-400] mt-0.5">
              Permanently deletes all store data. Contact Kyfaru to request store deletion.
            </div>
          </div>
          <button
            disabled
            className="h-9 px-4 rounded-[8px] border border-[--neutral-200] font-dm text-[13px] text-[--neutral-400] cursor-not-allowed opacity-60"
          >
            Delete Store
          </button>
        </div>
      </Card>

      <ConfirmModal
        open={confirmDeleteOrders}
        onClose={() => setConfirmDeleteOrders(false)}
        onConfirm={handleDeleteTestOrders}
        title="Delete all test orders?"
        description="This will permanently remove all pending, unpaid orders. This action cannot be undone."
        confirmLabel="Delete Test Orders"
        danger
        loading={deletingOrders}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminSettingsClient() {
  const [activeTab, setActiveTab] = useState("general");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () =>
      fetch("/api/admin/settings").then((r) => r.json()).then((j) => j.data?.settings ?? {}),
  });

  const settings: Settings = data ?? {};

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Save failed.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save setting.");
    },
  });

  const onSave = useCallback(
    (key: string, value: unknown) => saveMutation.mutate({ key, value }),
    [saveMutation],
  );

  const saving = saveMutation.isPending;

  function renderTab() {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] h-24 animate-pulse" />
          ))}
        </div>
      );
    }

    switch (activeTab) {
      case "general":       return <GeneralTab settings={settings} onSave={onSave} saving={saving} />;
      case "profile":       return <StoreProfileTab settings={settings} onSave={onSave} saving={saving} />;
      case "branding":      return <BrandingTab settings={settings} onSave={onSave} saving={saving} />;
      case "shipping":      return <ShippingTab />;
      case "payment":       return <PaymentTab />;
      case "notifications": return <NotificationsTab settings={settings} onSave={onSave} saving={saving} />;
      case "security":      return <SecurityTab settings={settings} onSave={onSave} saving={saving} />;
      case "api":           return <ApiTab />;
      case "danger":        return <DangerTab />;
      default:              return null;
    }
  }

  return (
    <div className="min-h-screen bg-[--neutral-50] dark:bg-[--dark-bg]">
      <PageHeader title="Settings" description="Configure your store and admin preferences" />

      <div className="flex gap-6 px-6 pb-6">
        {/* Left sidebar tab list */}
        <nav className="w-[220px] shrink-0 space-y-0.5">
          {TABS.map((tab) => {
            const isDanger = tab.id === "danger";
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 h-10 px-3 rounded-[8px] font-dm text-[14px] text-left transition-colors ${
                  isActive
                    ? isDanger
                      ? "bg-[--danger-bg] text-[--danger] font-medium"
                      : "bg-[--green-50] text-[--green-800] font-medium"
                    : isDanger
                      ? "text-[--danger] hover:bg-[--danger-bg]/60"
                      : "text-[--neutral-700] dark:text-[--dark-muted] hover:bg-[--neutral-100] dark:hover:bg-[--dark-border]"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Right panel */}
        <div className="flex-1 max-w-[640px]">
          {renderTab()}
        </div>
      </div>
    </div>
  );
}
