import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import PageHeader from "@/components/account/PageHeader"
import PasswordForm from "@/components/account/security/PasswordForm"
import TwoFactorSection from "@/components/account/security/TwoFactorSection"
import AccountRightPanel from "@/components/account/AccountRightPanel"
import type { AccountUser } from "@/types/account"

export default async function SecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const u = session.user
  const dbUser = await db.user.findUnique({
    where: { id: u.id },
    select: {
      usernameChanges: true, lastUsernameChange: true, phoneCode: true,
      langPreference: true, currencyDisplay: true,
      notifBotanicalUpdates: true, notifOrderTracking: true, notifPersonalized: true,
    },
  })

  const user: AccountUser = {
    id: u.id, name: u.name,
    firstName: (u as any).firstName ?? null, lastName: (u as any).lastName ?? null,
    username: (u as any).username ?? null, email: u.email, image: u.image ?? null,
    phone: (u as any).phone ?? null, phoneCode: dbUser?.phoneCode ?? null,
    country: (u as any).country ?? null, city: (u as any).city ?? null,
    usernameChanges: dbUser?.usernameChanges ?? 0, lastUsernameChange: dbUser?.lastUsernameChange ?? null,
    langPreference: dbUser?.langPreference ?? "en-GB", currencyDisplay: dbUser?.currencyDisplay ?? "KES",
    notifBotanicalUpdates: dbUser?.notifBotanicalUpdates ?? true,
    notifOrderTracking: dbUser?.notifOrderTracking ?? true,
    notifPersonalized: dbUser?.notifPersonalized ?? true,
    twoFactorEnabled: (u as any).twoFactorEnabled ?? false,
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-8">
      <div className="space-y-6">
        <PageHeader
          icon="lucide:shield"
          eyebrow="Account Security"
          title="Security"
          description="Manage your password and two-factor authentication settings."
        />

        <PasswordForm />
        <TwoFactorSection enabled={user.twoFactorEnabled} />
      </div>
      <AccountRightPanel user={user} />
    </div>
  )
}
