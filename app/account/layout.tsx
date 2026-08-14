import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAccountUser } from "@/lib/account/get-account-user"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import AccountSidebar from "@/components/account/AccountSidebar"
import MobileAccountNav from "@/components/account/MobileAccountNav"

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const user = await getAccountUser(session.user.id)
  if (!user) redirect("/login")

  const unreadCount = await db.inboxMessage.count({
    where: { userId: session.user.id, isRead: false },
  })

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB] dark:bg-neutral-950">
      <Navbar flat />

      <div className="flex flex-1">
        {/* Sidebar — sticky, desktop only */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-[76px] h-[calc(100vh-76px)] overflow-y-auto border-r border-neutral-200 bg-white dark:bg-neutral-900 dark:border-neutral-800">
          <AccountSidebar user={user} unreadCount={unreadCount} />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 pt-10 pb-24 lg:px-10 lg:pt-12 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Footer below the three-column section, not clipped inside sidebar 
      <Footer />*/}

      {/* Mobile bottom tab bar */}
      <MobileAccountNav unreadCount={unreadCount} />
    </div>
  )
}
