import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { reportError } from "@/lib/observability"

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const { searchParams } = new URL(req.url)

  try {
    // countOnly mode — for navbar bell unread count
    if (searchParams.get("countOnly") === "true") {
      const unreadCount = await db.inboxMessage.count({
        where: { userId: session.user.id, isRead: false },
      })
      return NextResponse.json({ ok: true, unreadCount })
    }

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
  } catch (e) {
    reportError(e, { route: "GET /api/account/inbox" })
    console.error("[account/inbox] GET error", e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    // markReadByOrderId — marks all messages for an order as read
    const { searchParams: patchParams } = new URL(req.url)
    const markReadByOrderId = patchParams.get("markReadByOrderId")
    if (markReadByOrderId) {
      await db.inboxMessage.updateMany({
        where: { userId: session.user.id, orderId: markReadByOrderId, isRead: false },
        data: { isRead: true },
      })
      return NextResponse.json({ ok: true })
    }

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
  } catch (e) {
    reportError(e, { route: "PATCH /api/account/inbox" })
    console.error("[account/inbox] PATCH error", e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
