import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import AccountSidebar from "@/components/account/AccountSidebar"
import MobileAccountNav from "@/components/account/MobileAccountNav"
import type { AccountUser } from "@/types/account"

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const u = session.user

  // Pull the extended fields that aren't on the session object
  const dbUser = await db.user.findUnique({
    where: { id: u.id },
    select: {
      usernameChanges: true,
      lastUsernameChange: true,
      phoneCode: true,
      langPreference: true,
      currencyDisplay: true,
      notifBotanicalUpdates: true,
      notifOrderTracking: true,
      notifPersonalized: true,
      inboxMessages: { where: { isRead: false }, select: { id: true } },
    },
  })

  const user: AccountUser = {
    id: u.id,
    name: u.name,
    firstName: (u as any).firstName ?? null,
    lastName: (u as any).lastName ?? null,
    username: (u as any).username ?? null,
    email: u.email,
    image: u.image ?? null,
    phone: (u as any).phone ?? null,
    phoneCode: dbUser?.phoneCode ?? null,
    country: (u as any).country ?? null,
    city: (u as any).city ?? null,
    usernameChanges: dbUser?.usernameChanges ?? 0,
    lastUsernameChange: dbUser?.lastUsernameChange ?? null,
    langPreference: dbUser?.langPreference ?? "en-GB",
    currencyDisplay: dbUser?.currencyDisplay ?? "KES",
    notifBotanicalUpdates: dbUser?.notifBotanicalUpdates ?? true,
    notifOrderTracking: dbUser?.notifOrderTracking ?? true,
    notifPersonalized: dbUser?.notifPersonalized ?? true,
    twoFactorEnabled: (u as any).twoFactorEnabled ?? false,
  }

  const unreadCount = dbUser?.inboxMessages.length ?? 0

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB]">
      <Navbar flat />

      <div className="flex flex-1">
        {/* Sidebar — sticky, desktop only */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-[76px] h-[calc(100vh-76px)] overflow-y-auto border-r border-neutral-200 bg-white">
          <AccountSidebar user={user} unreadCount={unreadCount} />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 pt-10 pb-24 lg:px-10 lg:pt-12 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Footer below the three-column section, not clipped inside sidebar */}
      <Footer />

      {/* Mobile bottom tab bar */}
      <MobileAccountNav unreadCount={unreadCount} />
    </div>
  )
}
