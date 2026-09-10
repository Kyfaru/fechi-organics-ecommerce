import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getAccountUser } from "@/lib/account/get-account-user"
import PageHeader from "@/components/account/PageHeader"
import CommunicationToggles from "@/components/account/settings/CommunicationToggles"
import RegionalSettings from "@/components/account/settings/RegionalSettings"
import AccountRightPanel, { BotanicalDashboardCard } from "@/components/account/AccountRightPanel"

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const user = await getAccountUser(session.user.id)
  if (!user) redirect("/login")

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-8">
      <div className="space-y-6">
        <PageHeader
          icon="lucide:settings"
          eyebrow="Account Settings"
          title="Settings"
          description="Manage your communication preferences and regional settings."
        />

        <div className="tablet:hidden">
          <BotanicalDashboardCard user={user} />
        </div>

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
      <AccountRightPanel user={user} hideExtras />
    </div>
  )
}
