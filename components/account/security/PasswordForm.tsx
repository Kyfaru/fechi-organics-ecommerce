"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

function inputClass(hasError?: boolean) {
  return hasError
    ? "w-full px-4 py-3 border border-red-400 rounded-lg text-[15px] bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
    : "w-full px-4 py-3 border border-neutral-300 rounded-lg text-[15px] bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D]"
}

function PasswordInput({ label, value, onChange, placeholder, error }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-600 mb-2">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "••••••••"}
          className={inputClass(Boolean(error)) + " pr-10"}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
        >
          <Icon icon={show ? "lucide:eye-off" : "lucide:eye"} width={14} />
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-red-500">{error}</p>}
    </div>
  )
}

function strength(pw: string) {
  const checks = [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[a-z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ]
  return checks.filter(Boolean).length
}

const STRENGTH_LABELS = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"]
const STRENGTH_COLORS = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-[#15803D]", "bg-[#15803D]"]

export default function PasswordForm({
  isOAuthOnly = false,
  setupRequiredTrigger = 0,
}: {
  isOAuthOnly?: boolean
  // Bumped by the 2FA section (via a shared parent) whenever a Google-only
  // user without a password tries to set up 2FA — increments on every
  // attempt (not a boolean) so a repeat click re-triggers the highlight even
  // if the user already dismissed it once by typing.
  setupRequiredTrigger?: number
}) {
  const [current, setCurrent] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, start] = useTransition()
  const [showSetupRequired, setShowSetupRequired] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (setupRequiredTrigger === 0) return
    setShowSetupRequired(true)
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [setupRequiredTrigger])

  const score = strength(newPw)
  const mismatch = confirm.length > 0 && newPw !== confirm
  const setupError = showSetupRequired ? "Set up a password first — required before enabling two-factor authentication" : undefined

  function handleSave() {
    if (!isOAuthOnly && !current) { toast.error("Current password is required"); return }
    if (!newPw || !confirm) { toast.error("New password fields are required"); return }
    if (newPw !== confirm) { toast.error("Passwords do not match"); return }
    if (score < 3) { toast.error("Password is too weak"); return }

    start(async () => {
      // A Google-only account has no existing credential account for
      // changePassword to verify currentPassword against — it always fails
      // with CREDENTIAL_ACCOUNT_NOT_FOUND regardless of what's passed. Use
      // setPassword instead: no currentPassword required, and it links a
      // fresh credential account rather than updating one that doesn't exist.
      // Cast needed the same way authClient.twoFactor is cast elsewhere in
      // this codebase — Better Auth's client type inference doesn't surface
      // this base endpoint even though the server exposes it.
      const res = isOAuthOnly
        ? await (authClient as any).setPassword({ newPassword: newPw })
        : await authClient.changePassword({ currentPassword: current, newPassword: newPw, revokeOtherSessions: false })
      if (res.error) { toast.error(res.error.message ?? "Failed to update password"); return }
      toast.success("Password updated")
      setCurrent(""); setNewPw(""); setConfirm("")
    })
  }

  return (
    <div ref={formRef} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-neutral-100 flex items-center gap-2">
        <Icon icon="lucide:key-round" width={16} className="text-[#15803D]" />
        <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Change Password</h2>
      </div>
      <div className="p-6 space-y-5 max-w-lg">
        {!isOAuthOnly && (
          <PasswordInput label="Current Password" value={current} onChange={setCurrent} />
        )}
        <PasswordInput
          label="New Password"
          value={newPw}
          onChange={(v) => { setNewPw(v); setShowSetupRequired(false) }}
          error={setupError}
        />

        {/* Strength bar */}
        {newPw.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${i <= score ? STRENGTH_COLORS[score] : "bg-neutral-200"}`}
                />
              ))}
            </div>
            <p className="text-[11px] text-neutral-400">{STRENGTH_LABELS[score]}</p>
          </div>
        )}

        <PasswordInput
          label="Confirm New Password"
          value={confirm}
          onChange={(v) => { setConfirm(v); setShowSetupRequired(false) }}
          error={setupError}
        />
        {mismatch && <p className="text-[12px] text-red-500">Passwords do not match</p>}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || mismatch}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#15803D] hover:bg-[#16A34A] text-white text-[15px] font-semibold transition-colors disabled:opacity-50"
          >
            {pending && <Icon icon="lucide:loader-2" width={14} className="animate-spin" />}
            Update Password
          </button>
        </div>
      </div>
    </div>
  )
}
