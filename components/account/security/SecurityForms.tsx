"use client"

import { useState } from "react"
import PasswordForm from "@/components/account/security/PasswordForm"
import TwoFactorSection from "@/components/account/security/TwoFactorSection"

/**
 * Small client wrapper joining PasswordForm and TwoFactorSection — both are
 * otherwise independent, but a Google-only user attempting a password-gated
 * 2FA action needs to be routed to "set up a password first" in the form
 * above, which means lifting one bit of shared state above both.
 */
export default function SecurityForms({
  isOAuthOnly,
  twoFactor,
}: {
  isOAuthOnly: boolean
  twoFactor: {
    enabled: boolean
    twoFaEmail: boolean
    twoFaPhone: boolean
    userEmail: string
    userPhone: string | null
  }
}) {
  const [passwordSetupTrigger, setPasswordSetupTrigger] = useState(0)

  return (
    <>
      <PasswordForm isOAuthOnly={isOAuthOnly} setupRequiredTrigger={passwordSetupTrigger} />
      <TwoFactorSection
        {...twoFactor}
        isOAuthOnly={isOAuthOnly}
        onRequirePasswordFirst={() => setPasswordSetupTrigger((n) => n + 1)}
      />
    </>
  )
}
