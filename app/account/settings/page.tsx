import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import PageHeader from "@/components/account/PageHeader"
import CommunicationToggles from "@/components/account/settings/CommunicationToggles"
import RegionalSettings from "@/components/account/settings/RegionalSettings"
import AccountRightPanel from "@/components/account/AccountRightPanel"
import type { AccountUser } from "@/types/account"

export default async function SettingsPage() {
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
          icon="lucide:settings"
          eyebrow="Account Settings"
          title="Settings"
          description="Manage your communication preferences and regional settings."
        />

        <CommunicationToggles
          notifBotanicalUpdates={user.notifBotanicalUpdates}
          notifOrderTracking={user.notifOrderTracking}
          notifPersonalized={user.notifPersonalized}
        />

        <RegionalSettings
          langPreference={user.langPreference}
          currencyDisplay={user.currencyDisplay}
        />
      </div>
      <AccountRightPanel user={user} />
    </div>
  )
}
