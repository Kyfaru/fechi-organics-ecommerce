import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const take = 20

  const [messages, total, unread] = await Promise.all([
    db.inboxMessage.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    db.inboxMessage.count({ where: { userId: session.user.id } }),
    db.inboxMessage.count({ where: { userId: session.user.id, isRead: false } }),
  ])

  return NextResponse.json({ ok: true, data: messages, total, unread, page, pages: Math.ceil(total / take) })
}

export async function PATCH(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, readAll } = body as { id?: string; readAll?: boolean }

  if (readAll) {
    await db.inboxMessage.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    })
  } else if (id) {
    await db.inboxMessage.updateMany({
      where: { id, userId: session.user.id },
      data: { isRead: true },
    })
  }

  return NextResponse.json({ ok: true })
}
