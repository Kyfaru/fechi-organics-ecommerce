import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import PageHeader from "@/components/account/PageHeader"
import InboxClient from "@/components/account/inbox/InboxClient"

export default async function InboxPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const messages = await db.inboxMessage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  const unread = messages.filter((m) => !m.isRead).length

  return (
    <div className="space-y-6">
      <PageHeader
        icon="lucide:inbox"
        eyebrow="Notifications"
        title="Inbox"
        description={unread > 0 ? `${unread} unread message${unread !== 1 ? "s" : ""}` : undefined}
      />

      <InboxClient
        initialMessages={messages.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
          type: m.type as any,
        }))}
        initialUnread={unread}
      />
    </div>
  )
}
