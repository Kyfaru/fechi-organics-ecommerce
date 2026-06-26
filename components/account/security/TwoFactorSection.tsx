"use client"

import { useState, useTransition } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

type Step = "idle" | "qr" | "verify" | "done"

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="000000"
      className="w-40 px-4 py-3 border border-neutral-300 rounded-lg text-center text-xl font-mono tracking-[0.3em] focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D]"
    />
  )
}

export default function TwoFactorSection({ enabled: initialEnabled }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [step, setStep] = useState<Step>("idle")
  const [qrUri, setQrUri] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [disablePassword, setDisablePassword] = useState("")
  const [showDisable, setShowDisable] = useState(false)
  const [pending, start] = useTransition()

  function handleEnable() {
    start(async () => {
      const res = await (authClient.twoFactor as any).enable({ password: "" })
      if (res?.data?.totpURI) {
        setQrUri(res.data.totpURI)
        setStep("qr")
      } else {
        // Better Auth may need password — ask for it via a prompt approach
        // Simplified: if no password requirement, go straight to QR
        toast.error("Could not initiate 2FA setup")
      }
    })
  }

  function handleVerify() {
    if (totpCode.length !== 6) { toast.error("Enter your 6-digit code"); return }
    start(async () => {
      const res = await (authClient.twoFactor as any).verifyTotp({ code: totpCode })
      if (res?.error) { toast.error("Invalid code — try again"); return }
      setEnabled(true)
      setStep("done")
      toast.success("Two-factor authentication enabled")
    })
  }

  function handleDisable() {
    if (!disablePassword) { toast.error("Enter your password to disable 2FA"); return }
    start(async () => {
      const res = await (authClient.twoFactor as any).disable({ password: disablePassword })
      if (res?.error) { toast.error(res.error.message ?? "Failed to disable 2FA"); return }
      setEnabled(false)
      setShowDisable(false)
      setDisablePassword("")
      toast.success("Two-factor authentication disabled")
    })
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:shield-check" width={14} className="text-[#15803D]" />
          <h2 className="text-[13px] font-semibold text-neutral-700 uppercase tracking-wide">Two-Factor Authentication</h2>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${enabled ? "bg-green-50 text-[#15803D] border-green-200" : "bg-neutral-100 text-neutral-500 border-neutral-200"}`}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      <div className="p-5">
        {/* Idle — not enabled */}
        {!enabled && step === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              Add an extra layer of security. When enabled, you&apos;ll need your authenticator app code on each login.
            </p>
            <button
              type="button"
              onClick={handleEnable}
              disabled={pending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#16A34A] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {pending && <Icon icon="lucide:loader-2" width={14} className="animate-spin" />}
              Enable 2FA
            </button>
          </div>
        )}

        {/* QR code step */}
        {step === "qr" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).
            </p>
            <div className="flex flex-col items-center gap-4 py-4">
              {qrUri && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUri)}`}
                  alt="TOTP QR Code"
                  className="w-44 h-44 rounded-lg border border-neutral-200"
                />
              )}
              <p className="text-[11px] text-neutral-400 text-center max-w-xs">
                Can&apos;t scan? Copy your authenticator app&apos;s manual entry key from the app.
              </p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep("idle")} className="px-4 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep("verify")}
                className="px-5 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A]"
              >
                I&apos;ve scanned it
              </button>
            </div>
          </div>
        )}

        {/* Verify TOTP code */}
        {step === "verify" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">Enter the 6-digit code from your authenticator app to confirm setup.</p>
            <OtpInput value={totpCode} onChange={setTotpCode} />
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep("qr")} className="px-4 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50">
                Back
              </button>
              <button
                type="button"
                onClick={handleVerify}
                disabled={pending || totpCode.length !== 6}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#16A34A] disabled:opacity-50"
              >
                {pending && <Icon icon="lucide:loader-2" width={14} className="animate-spin" />}
                Verify & Enable
              </button>
            </div>
          </div>
        )}

        {/* Done / already enabled */}
        {enabled && step !== "verify" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-[#F0FDF4] border border-[#DCFCE7] rounded-xl">
              <Icon icon="lucide:shield-check" width={18} className="text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#15803D]">2FA is active</p>
                <p className="text-[12px] text-neutral-500 mt-0.5">Your account requires an authenticator code on each sign-in.</p>
              </div>
            </div>

            {!showDisable ? (
              <button
                type="button"
                onClick={() => setShowDisable(true)}
                className="px-5 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Disable 2FA
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-700 font-medium">Enter your password to disable 2FA</p>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full px-3.5 py-2.5 border border-red-200 rounded-md text-sm bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowDisable(false); setDisablePassword("") }} className="px-4 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-600 hover:bg-white">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDisable}
                    disabled={pending}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    {pending && <Icon icon="lucide:loader-2" width={14} className="animate-spin" />}
                    Confirm Disable
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
