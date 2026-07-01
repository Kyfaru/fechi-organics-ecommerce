"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

async function getAuthedUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

export async function updateProfile(data: {
  firstName: string
  lastName: string
  phone: string
  phoneCode: string
  country: string
  city: string
  username?: string
}) {
  const userId = await getAuthedUserId()

  // Username change enforcement
  if (data.username !== undefined && data.username !== "") {
    const current = await db.user.findUnique({
      where: { id: userId },
      select: { username: true, usernameChanges: true, lastUsernameChange: true },
    })

    const isNewUsername = current?.username !== data.username

    if (isNewUsername) {
      if ((current?.usernameChanges ?? 0) >= 10) {
        throw new Error("Username change limit reached (10/10)")
      }
      if (current?.lastUsernameChange) {
        const daysSince =
          (Date.now() - current.lastUsernameChange.getTime()) / 86400000
        if (daysSince < 30) {
          const daysLeft = Math.ceil(30 - daysSince)
          throw new Error(`Username cooldown active — ${daysLeft} day(s) remaining`)
        }
      }

      const taken = await db.user.findUnique({ where: { username: data.username } })
      if (taken && taken.id !== userId) throw new Error("Username already taken")
    }

    await db.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        name: `${data.firstName} ${data.lastName}`.trim(),
        phone: data.phone,
        phoneCode: data.phoneCode,
        country: data.country,
        city: data.city,
        ...(isNewUsername && {
          username: data.username,
          usernameChanges: { increment: 1 },
          lastUsernameChange: new Date(),
        }),
      },
    })
  } else {
    await db.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        name: `${data.firstName} ${data.lastName}`.trim(),
        phone: data.phone,
        phoneCode: data.phoneCode,
        country: data.country,
        city: data.city,
      },
    })
  }

  revalidatePath("/account/profile", "layout")
  return { ok: true }
}

export async function updateNotifications(data: {
  notifBotanicalUpdates: boolean
  notifOrderTracking: boolean
  notifPersonalized: boolean
}) {
  const userId = await getAuthedUserId()
  await db.user.update({ where: { id: userId }, data })
  revalidatePath("/account/settings")
  return { ok: true }
}

export async function updateRegional(data: {
  langPreference: string
  currencyDisplay: string
}) {
  const userId = await getAuthedUserId()
  await db.user.update({ where: { id: userId }, data })
  revalidatePath("/account/settings")
  return { ok: true }
}

export async function deleteAccount() {
  const userId = await getAuthedUserId()

  // Sign out first to invalidate the session token
  await auth.api.signOut({ headers: await headers() })

  // Delete user — cascades to sessions, accounts, twoFactors, etc.
  await db.user.delete({ where: { id: userId } })

  redirect("/")
}
