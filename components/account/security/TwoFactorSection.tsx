"use client"

import { useState, useTransition } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

// ── OTP input ────────────────────────────────────────────────────────────────
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="000000"
      className="w-36 px-4 py-2.5 border border-neutral-300 rounded-lg text-center text-xl font-mono tracking-[0.3em] focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D]"
    />
  )
}

// ── TOTP method (Authenticator App) ─────────────────────────────────────────
function AuthAppMethod({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"idle" | "qr" | "verify" | "disable">("idle")
  const [qrUri, setQrUri] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [disablePw, setDisablePw] = useState("")
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [pending, start] = useTransition()

  function handleEnable() {
    start(async () => {
      const res = await (authClient.twoFactor as any).enable({ password: "" })
      if (res?.data?.totpURI) { setQrUri(res.data.totpURI); setStep("qr") }
      else toast.error("Could not initiate 2FA setup")
    })
  }

  function handleVerify() {
    if (totpCode.length !== 6) { toast.error("Enter your 6-digit code"); return }
    start(async () => {
      const res = await (authClient.twoFactor as any).verifyTotp({ code: totpCode })
      if (res?.error) { toast.error("Invalid code — try again"); return }
      setIsEnabled(true); setStep("idle"); setOpen(false)
      toast.success("Authenticator app enabled")
    })
  }

  function handleDisable() {
    if (!disablePw) { toast.error("Enter your password"); return }
    start(async () => {
      const res = await (authClient.twoFactor as any).disable({ password: disablePw })
      if (res?.error) { toast.error(res.error.message ?? "Failed"); return }
      setIsEnabled(false); setStep("idle"); setOpen(false); setDisablePw("")
      toast.success("Authenticator app disabled")
    })
  }

  return (
    <MethodRow
      icon="lucide:smartphone"
      title="Authenticator App"
      description="Google Authenticator, Authy, etc."
      statusLabel={isEnabled ? "Active" : "Not set up"}
      isEnabled={isEnabled}
      open={open}
      onToggle={() => { setOpen((v) => !v); setStep("idle") }}
      actionLabel={isEnabled ? "Manage" : "Set up"}
    >
      {!isEnabled && step === "idle" && (
        <button onClick={handleEnable} disabled={pending}
          className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A] disabled:opacity-50 flex items-center gap-2">
          {pending && <Icon icon="lucide:loader-2" width={13} className="animate-spin" />}
          Get started
        </button>
      )}
      {step === "qr" && qrUri && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Scan this QR code with your authenticator app.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrUri)}`}
            alt="TOTP QR" className="w-40 h-40 rounded-lg border border-neutral-200" />
          <button onClick={() => setStep("verify")}
            className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A]">
            I&apos;ve scanned it
          </button>
        </div>
      )}
      {step === "verify" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Enter the 6-digit code from your app.</p>
          <OtpInput value={totpCode} onChange={setTotpCode} />
          <button onClick={handleVerify} disabled={pending || totpCode.length !== 6}
            className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A] disabled:opacity-50 flex items-center gap-2">
            {pending && <Icon icon="lucide:loader-2" width={13} className="animate-spin" />}
            Verify & Enable
          </button>
        </div>
      )}
      {isEnabled && step === "idle" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 bg-[#F0FDF4] border border-[#DCFCE7] rounded-lg">
            <Icon icon="lucide:shield-check" width={15} className="text-[#15803D] mt-0.5 shrink-0" />
            <p className="text-sm text-[#15803D]">Authenticator app is active on your account.</p>
          </div>
          <button onClick={() => setStep("disable")}
            className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
            Disable
          </button>
        </div>
      )}
      {step === "disable" && (
        <div className="space-y-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 font-medium">Enter your password to disable</p>
          <input type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)}
            placeholder="Current password" className="w-full px-3 py-2 border border-red-200 rounded text-sm bg-white focus:outline-none focus:border-red-400" />
          <div className="flex gap-2">
            <button onClick={() => setStep("idle")} className="px-3 py-1.5 rounded border border-neutral-200 text-sm">Cancel</button>
            <button onClick={handleDisable} disabled={pending}
              className="px-3 py-1.5 rounded bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
              {pending && <Icon icon="lucide:loader-2" width={12} className="animate-spin" />}
              Confirm Disable
            </button>
          </div>
        </div>
      )}
    </MethodRow>
  )
}

// ── Email OTP method ─────────────────────────────────────────────────────────
function EmailOTPMethod({ isEnabled: initialEnabled, userEmail }: { isEnabled: boolean; userEmail: string }) {
  const [open, setOpen] = useState(false)
  const [isEnabled, setIsEnabled] = useState(initialEnabled)
  const [step, setStep] = useState<"idle" | "sent">("idle")
  const [otp, setOtp] = useState("")
  const [pending, start] = useTransition()

  function handleSend() {
    start(async () => {
      const res = await fetch("/api/account/2fa/email/send", { method: "POST" })
      const j = await res.json()
      if (!j.ok) { toast.error(j.error?.message ?? "Failed to send code"); return }
      setStep("sent"); toast.success(`Code sent to ${userEmail}`)
    })
  }

  function handleVerify() {
    if (otp.length !== 6) { toast.error("Enter the 6-digit code"); return }
    start(async () => {
      const res = await fetch("/api/account/2fa/email/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      })
      const j = await res.json()
      if (!j.ok) { toast.error(j.error?.message ?? "Invalid code"); return }
      setIsEnabled(true); setStep("idle"); setOpen(false); setOtp("")
      toast.success("Email 2FA enabled")
    })
  }

  return (
    <MethodRow
      icon="lucide:mail"
      title="Email OTP"
      description={userEmail}
      statusLabel={isEnabled ? "Active" : "Not set up"}
      isEnabled={isEnabled}
      open={open}
      onToggle={() => { setOpen((v) => !v); setStep("idle") }}
      actionLabel={isEnabled ? "Active" : "Set up"}
    >
      {step === "idle" && !isEnabled && (
        <button onClick={handleSend} disabled={pending}
          className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A] disabled:opacity-50 flex items-center gap-2">
          {pending && <Icon icon="lucide:loader-2" width={13} className="animate-spin" />}
          Send verification code
        </button>
      )}
      {step === "sent" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Enter the 6-digit code sent to <strong>{userEmail}</strong></p>
          <OtpInput value={otp} onChange={setOtp} />
          <div className="flex gap-2">
            <button onClick={handleSend} disabled={pending} className="px-3 py-1.5 rounded border border-neutral-200 text-sm text-neutral-600">
              Resend
            </button>
            <button onClick={handleVerify} disabled={pending || otp.length !== 6}
              className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A] disabled:opacity-50 flex items-center gap-2">
              {pending && <Icon icon="lucide:loader-2" width={13} className="animate-spin" />}
              Verify
            </button>
          </div>
        </div>
      )}
      {isEnabled && (
        <div className="flex items-start gap-2 p-3 bg-[#F0FDF4] border border-[#DCFCE7] rounded-lg">
          <Icon icon="lucide:check-circle" width={15} className="text-[#15803D] mt-0.5 shrink-0" />
          <p className="text-sm text-[#15803D]">Email OTP is enabled. You will receive a code at {userEmail} when signing in.</p>
        </div>
      )}
    </MethodRow>
  )
}

// ── Phone/SMS method ─────────────────────────────────────────────────────────
function PhoneSMSMethod({ isEnabled: initialEnabled, userPhone }: { isEnabled: boolean; userPhone: string | null }) {
  const [open, setOpen] = useState(false)
  const [isEnabled, setIsEnabled] = useState(initialEnabled)
  const [step, setStep] = useState<"idle" | "sent">("idle")
  const [otp, setOtp] = useState("")
  const [pending, start] = useTransition()

  function handleSend() {
    if (!userPhone) { toast.error("No phone number on your account. Add one in Profile settings first."); return }
    start(async () => {
      const res = await fetch("/api/account/2fa/phone/send", { method: "POST" })
      const j = await res.json()
      if (!j.ok) { toast.error(j.error?.message ?? "Failed to send SMS"); return }
      setStep("sent"); toast.success("Code sent via SMS")
    })
  }

  function handleVerify() {
    if (otp.length !== 6) { toast.error("Enter the 6-digit code"); return }
    start(async () => {
      const res = await fetch("/api/account/2fa/phone/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      })
      const j = await res.json()
      if (!j.ok) { toast.error(j.error?.message ?? "Invalid code"); return }
      setIsEnabled(true); setStep("idle"); setOpen(false); setOtp("")
      toast.success("Phone 2FA enabled")
    })
  }

  return (
    <MethodRow
      icon="lucide:phone"
      title="Phone / SMS"
      description={userPhone ?? "No phone number set"}
      statusLabel={isEnabled ? "Active" : "Not set up"}
      isEnabled={isEnabled}
      open={open}
      onToggle={() => { setOpen((v) => !v); setStep("idle") }}
      actionLabel={isEnabled ? "Active" : "Set up"}
    >
      {!userPhone && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Add a phone number in your Profile settings first.
        </p>
      )}
      {userPhone && step === "idle" && !isEnabled && (
        <button onClick={handleSend} disabled={pending}
          className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A] disabled:opacity-50 flex items-center gap-2">
          {pending && <Icon icon="lucide:loader-2" width={13} className="animate-spin" />}
          Send SMS code
        </button>
      )}
      {step === "sent" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Enter the 6-digit code sent to <strong>{userPhone}</strong></p>
          <OtpInput value={otp} onChange={setOtp} />
          <div className="flex gap-2">
            <button onClick={handleSend} disabled={pending} className="px-3 py-1.5 rounded border border-neutral-200 text-sm text-neutral-600">Resend</button>
            <button onClick={handleVerify} disabled={pending || otp.length !== 6}
              className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A] disabled:opacity-50 flex items-center gap-2">
              {pending && <Icon icon="lucide:loader-2" width={13} className="animate-spin" />}
              Verify
            </button>
          </div>
        </div>
      )}
      {isEnabled && (
        <div className="flex items-start gap-2 p-3 bg-[#F0FDF4] border border-[#DCFCE7] rounded-lg">
          <Icon icon="lucide:check-circle" width={15} className="text-[#15803D] mt-0.5 shrink-0" />
          <p className="text-sm text-[#15803D]">SMS 2FA is enabled. Codes will be sent to {userPhone}.</p>
        </div>
      )}
    </MethodRow>
  )
}

// ── Backup Codes method ──────────────────────────────────────────────────────
function BackupCodesMethod() {
  const [open, setOpen] = useState(false)
  const [codes, setCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  async function fetchCodes() {
    setLoading(true)
    try {
      const res = await fetch("/api/account/2fa/backup-codes")
      const j = await res.json()
      if (j.ok && j.codes) setCodes(j.codes)
      else toast.error("Could not load backup codes")
    } catch {
      toast.error("Could not load backup codes")
    } finally {
      setLoading(false)
    }
  }

  function handleOpen() {
    const next = !open
    setOpen(next)
    if (next && codes.length === 0) fetchCodes()
  }

  return (
    <MethodRow
      icon="lucide:key"
      title="Backup Codes"
      description="One-time codes for account recovery"
      statusLabel="Available"
      isEnabled={false}
      open={open}
      onToggle={handleOpen}
      actionLabel="View codes"
    >
      {loading && (
        <div className="flex items-center gap-2 text-neutral-500 text-sm">
          <Icon icon="lucide:loader-2" width={14} className="animate-spin" />
          Loading codes…
        </div>
      )}
      {!loading && codes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Keep these codes safe. Each can be used once.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {codes.map((code, i) => (
              <code key={i} className="px-2 py-1 bg-neutral-100 rounded text-[12px] font-mono text-neutral-700 text-center">
                {code}
              </code>
            ))}
          </div>
          <button onClick={fetchCodes} className="text-sm text-[#15803D] hover:underline">
            Refresh
          </button>
        </div>
      )}
      {!loading && codes.length === 0 && open && (
        <p className="text-sm text-neutral-500">No backup codes available. Enable TOTP first.</p>
      )}
    </MethodRow>
  )
}

// ── MethodRow — shared row layout ────────────────────────────────────────────
function MethodRow({
  icon, title, description, statusLabel, isEnabled, open, onToggle, actionLabel, children,
}: {
  icon: string; title: string; description: string; statusLabel: string
  isEnabled: boolean; open: boolean; onToggle: () => void; actionLabel: string
  children?: React.ReactNode
}) {
  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center shrink-0">
          <Icon icon={icon} width={18} className="text-[#15803D]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-neutral-900">{title}</p>
          <p className="text-[12px] text-neutral-400 truncate">{description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${isEnabled ? "bg-green-50 text-[#15803D] border-green-200" : "bg-neutral-100 text-neutral-500 border-neutral-200"}`}>
            {statusLabel}
          </span>
          <button
            onClick={onToggle}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            {open ? "Close" : actionLabel}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-neutral-100 p-4 bg-neutral-50">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main TwoFactorSection ────────────────────────────────────────────────────
export default function TwoFactorSection({
  enabled,
  twoFaEmail = false,
  twoFaPhone = false,
  userEmail,
  userPhone,
}: {
  enabled: boolean
  twoFaEmail?: boolean
  twoFaPhone?: boolean
  userEmail: string
  userPhone?: string | null
}) {
  const anyEnabled = enabled || twoFaEmail || twoFaPhone

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="flex items-start gap-6 p-6 bg-[#f0fdf4] rounded-xl border border-[#dcfce7]">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-neutral-900 mb-2">Two-Factor Authentication</h2>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Add extra layers of security to your account. You can set up multiple verification methods — we&apos;ll use the most secure one available when you sign in.
          </p>
          {anyEnabled && (
            <div className="mt-3 flex items-center gap-2 text-[#15803D] text-sm font-semibold">
              <Icon icon="lucide:shield-check" width={16} />
              At least one method is active
            </div>
          )}
        </div>
        <svg width="72" height="72" viewBox="0 0 80 80" fill="none" className="shrink-0">
          <path d="M40 8L12 20v20c0 18.6 12 35.9 28 40 16-4.1 28-21.4 28-40V20L40 8z" fill="#dcfce7" stroke="#15803D" strokeWidth="2"/>
          <path d="M28 40l8 8 16-16" stroke="#15803D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Methods list */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-3 px-1">Verification Methods</p>
        <div className="space-y-3">
          <AuthAppMethod enabled={enabled} />
          <EmailOTPMethod isEnabled={twoFaEmail} userEmail={userEmail} />
          <PhoneSMSMethod isEnabled={twoFaPhone} userPhone={userPhone ?? null} />
          <BackupCodesMethod />
        </div>
      </div>
    </div>
  )
}
