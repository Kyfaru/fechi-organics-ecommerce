import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const items = await db.wishlistItem.findMany({
    where: { userId: session.user.id },
    orderBy: { addedAt: "desc" },
  })

  return NextResponse.json({ ok: true, data: items })
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { productId, productName, productImage, priceKes, originalPriceKes } = body

  if (!productId || !productName || typeof priceKes !== "number") {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 })
  }

  const item = await db.wishlistItem.upsert({
    where: { userId_productId: { userId: session.user.id, productId } },
    create: { userId: session.user.id, productId, productName, productImage, priceKes, originalPriceKes },
    update: { priceKes, originalPriceKes, productImage },
  })

  return NextResponse.json({ ok: true, data: item })
}

export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get("productId")
  if (!productId) return NextResponse.json({ ok: false }, { status: 400 })

  await db.wishlistItem.deleteMany({ where: { userId: session.user.id, productId } })
  return NextResponse.json({ ok: true })
}
