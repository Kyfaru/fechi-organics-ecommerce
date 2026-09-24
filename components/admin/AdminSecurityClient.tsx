"use client";

/**
 * AdminSecurityClient — /admin/security page
 *
 * Three independent 2FA method cards — any combination can be active:
 *   1. Authenticator App (TOTP) — set up / disable via Better Auth
 *   2. Email OTP  — send a code to the account email, verify it, THEN enable
 *      (user.twoFaEmail). Disabling is instant, no re-verification needed.
 *   3. SMS OTP    — same send-code-then-verify flow against the phone number
 *      already saved on /admin/profile (user.twoFaPhone). The phone number
 *      itself isn't editable here — change it on Profile.
 *
 * Both send/verify pairs reuse the existing account-level endpoints
 * (app/api/account/2fa/{phone,email}/{send,verify}) — they're session-generic
 * (work for any signed-in user, not customer-specific), so no admin-only
 * duplicates were needed.
 *
 * ?verify=email,sms in the URL (set by AdminProfileClient's re-verify modal,
 * which fires when a profile save leaves both channels disabled) makes the
 * matching card(s) pulse an orange glow once on arrival.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, Mail, MessageSquare, Copy, Eye, EyeOff, Shield } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { combineLegacyPhone } from "@/lib/phone";
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

/** Wraps a card and plays a single orange glow pulse around it on mount when `active`. */
function PulseGlow({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      className="rounded-[12px]"
      animate={
        active
          ? { boxShadow: ["0 0 0 0px rgba(249,115,22,0)", "0 0 0 5px rgba(249,115,22,0.45)", "0 0 0 0px rgba(249,115,22,0)"] }
          : {}
      }
      transition={{ duration: 1.8, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AdminMeData {
  userId: string;
  email: string;
  phone: string | null;
  phoneCode: string | null;
  twoFactorEnabled: boolean;
  twoFaEmail: boolean;
  twoFaPhone: boolean;
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
function EmailOtpCard({ profile, highlight }: { profile: AdminMeData; highlight: boolean }) {
  const qc = useQueryClient();
  const isEnabled = profile.twoFaEmail;
  const [step, setStep] = useState<"idle" | "verify">("idle");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSendCode() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/account/2fa/email/send", { method: "POST" });
      const json = await res.json();
      if (!json.ok) { toast.error(json.error?.message ?? "Failed to send code"); return; }
      toast.success("Code sent to your email");
      setStep("verify");
    } catch {
      toast.error("Failed to send code");
    } finally {
      setSending(false);
    }
  }

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/account/2fa/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Invalid code");
    },
    onSuccess: () => {
      toast.success("Email OTP enabled");
      qc.invalidateQueries({ queryKey: ["admin-me"] });
      setStep("idle");
      setOtp("");
    },
    onError: (e: Error) => setError(e.message),
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/2fa/method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "email", enable: false }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to disable");
    },
    onSuccess: () => {
      toast.success("Email OTP disabled");
      qc.invalidateQueries({ queryKey: ["admin-me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PulseGlow active={highlight}>
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
                onChange={(v) => {
                  if (v) { if (step === "idle") handleSendCode(); } // same action as the button below
                  else if (isEnabled) disableMutation.mutate();
                  else { setStep("idle"); setOtp(""); setError(""); } // mid-verification — cancel instead
                }}
                disabled={disableMutation.isPending || sending}
              />
            </div>
            <p className="font-dm text-[13px] text-(--neutral-500) mb-3">
              Receive a one-time code to your email address when signing in.
            </p>

            <div className="flex items-center gap-2 bg-(--neutral-50) px-3 py-2 rounded-[8px] border border-(--neutral-100) mb-3">
              <Mail size={13} className="text-(--neutral-400) shrink-0" />
              <span className="font-dm text-[13px] text-(--neutral-700)">{profile.email}</span>
            </div>

            {isEnabled ? null : step === "idle" ? (
              <button
                onClick={handleSendCode}
                disabled={sending}
                className="h-9 px-4 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[13px] font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2 w-fit"
              >
                {sending ? <Spinner size={13} /> : null}
                Send code to verify
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="font-dm text-[13px] font-medium text-(--neutral-700)">
                  Enter the 6-digit code sent to {profile.email}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className={inputCls}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                />
                {error && <p className="font-dm text-[12px] text-(--danger)">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep("idle"); setOtp(""); setError(""); }}
                    className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending || otp.length !== 6}
                    className="h-9 px-4 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[13px] font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2"
                  >
                    {verifyMutation.isPending ? <Spinner size={13} /> : null}
                    Verify &amp; Enable
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </PulseGlow>
  );
}

// ---------------------------------------------------------------------------
// Card 3 — SMS OTP
// ---------------------------------------------------------------------------
function SmsOtpCard({ profile, highlight }: { profile: AdminMeData; highlight: boolean }) {
  const qc = useQueryClient();
  const isEnabled = profile.twoFaPhone;
  const [step, setStep] = useState<"idle" | "verify">("idle");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const displayPhone = profile.phone ? combineLegacyPhone(profile.phone, profile.phoneCode) ?? profile.phone : null;

  async function handleSendCode() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/account/2fa/phone/send", { method: "POST" });
      const json = await res.json();
      // Surfaces the existing hasSmsConfig()/Africa's Talking checks from
      // /api/account/2fa/phone/send (e.g. "SMS is not available right now")
      // as a real toast instead of letting a misconfigured provider fail silently.
      if (!json.ok) { toast.error(json.error?.message ?? "Failed to send code"); return; }
      toast.success("Code sent to your phone");
      setStep("verify");
    } catch {
      toast.error("Failed to send code");
    } finally {
      setSending(false);
    }
  }

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/account/2fa/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Invalid code");
    },
    onSuccess: () => {
      toast.success("SMS OTP enabled");
      qc.invalidateQueries({ queryKey: ["admin-me"] });
      setStep("idle");
      setOtp("");
    },
    onError: (e: Error) => setError(e.message),
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/2fa/method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "sms", enable: false }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to disable");
    },
    onSuccess: () => {
      toast.success("SMS OTP disabled");
      qc.invalidateQueries({ queryKey: ["admin-me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PulseGlow active={highlight}>
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
                onChange={(v) => {
                  if (v) { if (step === "idle" && displayPhone) handleSendCode(); } // same action as the button below
                  else if (isEnabled) disableMutation.mutate();
                  else { setStep("idle"); setOtp(""); setError(""); } // mid-verification — cancel instead
                }}
                disabled={disableMutation.isPending || sending || !displayPhone}
              />
            </div>
            <p className="font-dm text-[13px] text-(--neutral-500) mb-3">
              Receive a one-time code via SMS to your phone number.
            </p>

            {!displayPhone ? (
              <p className="font-dm text-[13px] text-(--neutral-400)">
                Add a phone number in your Profile to enable this.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 bg-(--neutral-50) px-3 py-2 rounded-[8px] border border-(--neutral-100) mb-3">
                  <MessageSquare size={13} className="text-(--neutral-400) shrink-0" />
                  <span className="font-dm text-[13px] text-(--neutral-700)">{displayPhone}</span>
                </div>

                {isEnabled ? null : step === "idle" ? (
                  <button
                    onClick={handleSendCode}
                    disabled={sending}
                    className="h-9 px-4 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[13px] font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2 w-fit"
                  >
                    {sending ? <Spinner size={13} /> : null}
                    Send code to verify
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="font-dm text-[13px] font-medium text-(--neutral-700)">
                      Enter the 6-digit code sent to {displayPhone}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className={inputCls}
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                    />
                    {error && <p className="font-dm text-[12px] text-(--danger)">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setStep("idle"); setOtp(""); setError(""); }}
                        className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => verifyMutation.mutate()}
                        disabled={verifyMutation.isPending || otp.length !== 6}
                        className="h-9 px-4 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[13px] font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2"
                      >
                        {verifyMutation.isPending ? <Spinner size={13} /> : null}
                        Verify &amp; Enable
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Card>
    </PulseGlow>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminSecurityClient() {
  const searchParams = useSearchParams();
  const verifyParam = searchParams.get("verify") ?? "";
  const highlightSms = verifyParam.split(",").includes("sms");
  const highlightEmail = verifyParam.split(",").includes("email");

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
              Enable as many methods as you'd like
            </p>
            <p className="font-dm text-[12px] text-blue-600 dark:text-blue-400 mt-0.5">
              Authenticator App, Email OTP and SMS OTP can all be active at once — you'll choose
              which one to use each time you sign in.
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
            <EmailOtpCard profile={data} highlight={highlightEmail} />
            <SmsOtpCard profile={data} highlight={highlightSms} />
          </>
        )}
      </div>
    </div>
  );
}
