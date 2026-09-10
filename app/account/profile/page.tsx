import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAccountUser } from "@/lib/account/get-account-user"
import ProfileForm from "@/components/account/profile/ProfileForm"
import AccountRightPanel from "@/components/account/AccountRightPanel"

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const user = await getAccountUser(session.user.id)
  if (!user) redirect("/login")

  // Only social sign-ins need the "email change won't affect Google/Facebook
  // login" note — a user with a credential (password) account doesn't.
  const socialAccount = await db.account.findFirst({
    where: { userId: session.user.id, providerId: { in: ["google", "facebook"] } },
    select: { providerId: true },
  })

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-8">
      <ProfileForm user={user} socialProvider={socialAccount?.providerId ?? null} />
      <AccountRightPanel user={user} />
    </div>
  )
}
