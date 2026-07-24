import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import PageHeader from "@/components/account/PageHeader"
import { MessagesClient } from "@/components/account/MessagesClient"

export const metadata = { title: "Messages | Fechi Organics" }

export default async function AccountMessagesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  return (
    <div className="space-y-6">
      <PageHeader
        icon="lucide:message-circle"
        eyebrow="Support"
        title="Messages"
        description="Chat directly with our team about your orders or account."
      />
      <MessagesClient />
    </div>
  )
}
