import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAccountUser } from "@/lib/account/get-account-user"
import PageHeader from "@/components/account/PageHeader"
import SecurityForms from "@/components/account/security/SecurityForms"
import AccountRightPanel, { BotanicalDashboardCard } from "@/components/account/AccountRightPanel"

export default async function SecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const user = await getAccountUser(session.user.id)
  if (!user) redirect("/login")

  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { twoFaEmail: true, twoFaPhone: true },
  })

  const credentialAccount = await db.account.findFirst({
    where: { userId: session.user.id, providerId: "credential" },
    select: { id: true },
  })
  const isOAuthOnly = !credentialAccount

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-8">
      <div className="space-y-6">
        <PageHeader
          icon="lucide:shield"
          eyebrow="Account Security"
          title="Security"
          description="Manage your password and two-factor authentication settings."
        />

        <div className="tablet:hidden">
          <BotanicalDashboardCard user={user} />
        </div>

        <SecurityForms
          isOAuthOnly={isOAuthOnly}
          twoFactor={{
            enabled: user.twoFactorEnabled,
            twoFaEmail: dbUser?.twoFaEmail ?? false,
            twoFaPhone: dbUser?.twoFaPhone ?? false,
            userEmail: user.email,
            userPhone: user.phone,
          }}
        />
      </div>
      <AccountRightPanel user={user} />
    </div>
  )
}
