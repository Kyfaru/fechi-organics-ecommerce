import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { r2PublicUrl } from "@/lib/r2"
import type { OrderStatus } from "@prisma/client"

const ONGOING: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "WAITING_TO_PACKAGE", "READY_FOR_PICKUP"]
const DELIVERED: OrderStatus[] = ["DELIVERED", "PICKED_UP"]
const CANCELLED: OrderStatus[] = ["CANCELLED"]

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tab = searchParams.get("tab") ?? "all"
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const take = 10

  const statusFilter: OrderStatus[] | undefined =
    tab === "ongoing" ? ONGOING :
    tab === "delivered" ? DELIVERED :
    tab === "cancelled" ? CANCELLED :
    undefined

  const where = {
    userId: session.user.id,
    ...(statusFilter ? { status: { in: statusFilter } } : {}),
  }

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        totalKes: true,
        deliveryType: true,
        items: {
          take: 1,
          select: {
            name: true,
            quantity: true,
            product: {
              select: {
                images: { where: { isPrimary: true }, take: 1, select: { objectKey: true } },
              },
            },
          },
        },
      },
    }),
    db.order.count({ where }),
  ])

  const data = orders.map((o) => ({
    ...o,
    thumbnail: o.items[0]?.product.images[0]?.objectKey
      ? r2PublicUrl(o.items[0].product.images[0].objectKey)
      : null,
    itemCount: o.items.length,
  }))

  return NextResponse.json({ ok: true, data, total, page, pages: Math.ceil(total / take) })
}
