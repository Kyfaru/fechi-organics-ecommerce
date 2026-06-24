"use client";

/**
 * AdminSecurityClient — /admin/security page
 *
 * Three 2FA method cards:
 *   1. Authenticator App (TOTP) — set up / disable via Better Auth
 *   2. Email OTP              — toggle; saves method to adminProfile
 *   3. SMS OTP                — toggle + phone number input
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, Mail, MessageSquare, Copy, Eye, EyeOff, Shield } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import Switch from "@/components/ui/Switch";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------
const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-300) dark:border-(--dark-border) font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) bg-white dark:bg-(--dark-surface) outline-none focus:border-(--green-600) transition-colors placeholder:text-(--neutral-400)";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AdminMeData {
  userId: string;
  email: string;
  phone: string | null;
  twoFactorEnabled: boolean;
  twoFaMethod: string;
}

// ---------------------------------------------------------------------------
// Card 1 — Authenticator App (TOTP)
// ---------------------------------------------------------------------------
function TotpCard({ profile }: { profile: AdminMeData }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"idle" | "setup" | "disable">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEnabled = profile.twoFactorEnabled;

  async function handleEnable() {
    if (!password) { setError("Password is required"); return; }
    setLoading(true);
    setError("");
    try {
      const result = await authClient.twoFactor.enable({ password });
      if (result?.error) { setError("Invalid password"); return; }
      const uri = (result?.data as { totpURI?: string } | null)?.totpURI ?? "";
      setTotpUri(uri);
      setStep("setup");
    } catch {
      setError("Failed to initialize 2FA setup");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySetup() {
    if (!code || code.length !== 6) { setError("Enter the 6-digit code"); return; }
    setLoading(true);
    setError("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result?.error) { setError("Invalid code — check your authenticator app"); return; }
      toast.success("Authenticator app enabled");
      qc.invalidateQueries({ queryKey: ["admin-me"] });
      setStep("idle");
      setPassword("");
      setCode("");
      setTotpUri("");
    } catch {
      setError("Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    if (!password) { setError("Password is required"); return; }
    setLoading(true);
    setError("");
    try {
      const result = await authClient.twoFactor.disable({ password });
      if (result?.error) { setError("Invalid password"); return; }
      toast.success("Authenticator app disabled");
      qc.invalidateQueries({ queryKey: ["admin-me"] });
      setStep("idle");
      setPassword("");
    } catch {
      setError("Failed to disable 2FA");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-[10px] bg-(--green-50) flex items-center justify-center shrink-0">
          <Smartphone size={20} className="text-(--green-800)" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
              Authenticator App (TOTP)
            </h3>
            <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${isEnabled ? "bg-green-100 text-green-700" : "bg-(--neutral-100) text-(--neutral-500)"}`}>
              {isEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="font-dm text-[13px] text-(--neutral-500) mb-4">
            Use Google Authenticator, Authy, or any TOTP app to generate login codes.
          </p>

          {step === "idle" && (
            <>
              {!isEnabled ? (
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      className={`${inputCls} pr-10`}
                      placeholder="Enter your password to begin setup"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    />
                    <button type="button" onClick={() => setShowPw((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-400) hover:text-(--neutral-600)">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {error && <p className="font-dm text-[12px] text-(--danger)">{error}</p>}
                  <button
                    onClick={handleEnable}
                    disabled={loading}
                    className="h-10 px-6 w-fit rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2"
                  >
                    {loading ? <Spinner size={14} /> : null}
                    Set Up Authenticator App
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      className={`${inputCls} pr-10`}
                      placeholder="Enter your password to disable 2FA"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    />
                    <button type="button" onClick={() => setShowPw((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-400) hover:text-(--neutral-600)">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {error && <p className="font-dm text-[12px] text-(--danger)">{error}</p>}
                  <button
                    onClick={handleDisable}
                    disabled={loading}
                    className="h-10 px-6 w-fit rounded-[8px] border border-(--danger)/30 bg-(--danger-bg) font-dm text-[13px] text-(--danger) hover:bg-(--danger)/10 transition-colors disabled:opacity-60 flex items-center gap-2"
                  >
                    {loading ? <Spinner size={14} /> : null}
                    Disable Authenticator App
                  </button>
                </div>
              )}
            </>
          )}

          {step === "setup" && (
            <div className="flex flex-col gap-4">
              {totpUri && (
                <div className="flex flex-col items-center gap-3 p-4 bg-(--neutral-50) rounded-[10px] border border-(--neutral-200)">
                  <QRCodeSVG value={totpUri} size={160} bgColor="#ffffff" fgColor="#1a1c1c" level="M" />
                  <p className="font-dm text-[12px] text-(--neutral-500) text-center">
                    Scan with Google Authenticator, Authy, or any TOTP app
                  </p>
                  <details className="w-full">
                    <summary className="font-dm text-[11px] text-(--neutral-400) cursor-pointer hover:underline text-center">
                      Manual entry key
                    </summary>
                    <div className="mt-2 flex items-center gap-2 bg-white border border-(--neutral-200) rounded-[6px] px-3 py-2">
                      <span className="font-mono text-[11px] text-(--neutral-700) flex-1 break-all">{totpUri}</span>
                      <button onClick={() => { navigator.clipboard.writeText(totpUri); toast.success("Copied"); }}
                        className="text-(--neutral-400) hover:text-(--neutral-700) shrink-0">
                        <Copy size={13} />
                      </button>
                    </div>
                  </details>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="font-dm text-[13px] font-medium text-(--neutral-700)">
                  Enter the 6-digit code from your app to confirm
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className={inputCls}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                />
                {error && <p className="font-dm text-[12px] text-(--danger)">{error}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setStep("idle"); setTotpUri(""); setCode(""); setPassword(""); setError(""); }}
                  className="h-10 px-5 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerifySetup}
                  disabled={loading || code.length !== 6}
                  className="h-10 px-6 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {loading ? <Spinner size={14} /> : null}
                  Confirm &amp; Activate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card 2 — Email OTP
// ---------------------------------------------------------------------------
function EmailOtpCard({ profile }: { profile: AdminMeData }) {
  const qc = useQueryClient();
  const isEnabled = profile.twoFaMethod === "email";

  const toggleMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      const res = await fetch("/api/admin/2fa/method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: enable ? "email" : "totp" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update method");
    },
    onSuccess: (_, enable) => {
      toast.success(enable ? "Email OTP enabled" : "Email OTP disabled");
      qc.invalidateQueries({ queryKey: ["admin-me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-[10px] bg-blue-50 flex items-center justify-center shrink-0">
          <Mail size={20} className="text-blue-700" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
              Email OTP
            </h3>
            <Switch
              checked={isEnabled}
              onChange={(v) => toggleMutation.mutate(v)}
              disabled={toggleMutation.isPending}
            />
          </div>
          <p className="font-dm text-[13px] text-(--neutral-500) mb-3">
            Receive a one-time code to your email address when signing in.
          </p>
          <div className="flex items-center gap-2 bg-(--neutral-50) px-3 py-2 rounded-[8px] border border-(--neutral-100)">
            <Mail size={13} className="text-(--neutral-400) shrink-0" />
            <span className="font-dm text-[13px] text-(--neutral-700)">{profile.email}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card 3 — SMS OTP
// ---------------------------------------------------------------------------
function SmsOtpCard({ profile }: { profile: AdminMeData }) {
  const qc = useQueryClient();
  const isEnabled = profile.twoFaMethod === "sms";
  const [phone, setPhone] = useState(profile.phone ?? "");

  const toggleMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      const res = await fetch("/api/admin/2fa/method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: enable ? "sms" : "totp", phone: enable ? phone : undefined }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update method");
    },
    onSuccess: (_, enable) => {
      toast.success(enable ? "SMS OTP enabled" : "SMS OTP disabled");
      qc.invalidateQueries({ queryKey: ["admin-me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleToggle(enable: boolean) {
    if (enable && !phone.trim()) {
      toast.error("Enter a phone number first");
      return;
    }
    toggleMutation.mutate(enable);
  }

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-[10px] bg-purple-50 flex items-center justify-center shrink-0">
          <MessageSquare size={20} className="text-purple-700" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
              SMS OTP
            </h3>
            <Switch
              checked={isEnabled}
              onChange={handleToggle}
              disabled={toggleMutation.isPending}
            />
          </div>
          <p className="font-dm text-[13px] text-(--neutral-500) mb-3">
            Receive a one-time code via SMS to your phone number.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="font-dm text-[13px] font-medium text-(--neutral-700)">Phone number</label>
            <input
              type="tel"
              className={inputCls}
              placeholder="+254 700 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isEnabled}
            />
            {isEnabled && (
              <p className="font-dm text-[12px] text-(--neutral-400)">
                Disable SMS OTP to change your phone number.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminSecurityClient() {
  const { data, isLoading } = useQuery<AdminMeData>({
    queryKey: ["admin-me"],
    queryFn: () => fetch("/api/admin/me").then((r) => r.json()),
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader
        title="Security"
        description="Manage two-factor authentication methods for your admin account"
      />

      <div className="px-6 pb-8 max-w-[640px] space-y-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-[10px] p-4">
          <Shield size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-dm text-[13px] font-medium text-blue-800 dark:text-blue-300">
              One method active at a time
            </p>
            <p className="font-dm text-[12px] text-blue-600 dark:text-blue-400 mt-0.5">
              Enabling Email OTP or SMS OTP overrides the default TOTP method. The authenticator app
              can be kept active independently as a fallback.
            </p>
          </div>
        </div>

        {isLoading || !data ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) h-28 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <TotpCard profile={data} />
            <EmailOtpCard profile={data} />
            <SmsOtpCard profile={data} />
          </>
        )}
      </div>
    </div>
  );
}
