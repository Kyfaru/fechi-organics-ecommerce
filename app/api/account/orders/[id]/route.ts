import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { r2PublicUrl } from "@/lib/r2"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const { id } = await params
  const order = await db.order.findFirst({
    where: { id, userId: session.user.id },
    include: {
      items: {
        include: {
          product: {
            select: {
              images: { where: { isPrimary: true }, take: 1, select: { objectKey: true } },
            },
          },
        },
      },
      statusEvents: { orderBy: { occurredAt: "asc" } },
      transactions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  })

  if (!order) return NextResponse.json({ ok: false }, { status: 404 })

  const data = {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      imageUrl: item.product.images[0]?.objectKey
        ? r2PublicUrl(item.product.images[0].objectKey)
        : null,
    })),
  }

  return NextResponse.json({ ok: true, data })
}
