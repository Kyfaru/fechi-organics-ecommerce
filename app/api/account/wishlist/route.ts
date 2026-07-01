import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

const AddSchema = z.object({ productId: z.string().uuid() }).strict()

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
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = AddSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 })

  // Derive display fields server-side from the product record — never trust
  // client-supplied name/price/image (previously stored verbatim, allowing
  // spoofed prices and unvalidated content in productName/productImage).
  const product = await db.product.findUnique({
    where: { id: parsed.data.productId },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  })
  if (!product) return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 })

  const primary = product.images.find((i) => i.isPrimary) ?? product.images[0]

  const item = await db.wishlistItem.upsert({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
    create: {
      userId: session.user.id,
      productId: product.id,
      productName: product.name,
      productImage: primary?.objectKey ?? null,
      priceKes: product.priceKes,
      originalPriceKes: product.compareAtPriceKes,
    },
    update: {
      productName: product.name,
      priceKes: product.priceKes,
      originalPriceKes: product.compareAtPriceKes,
      productImage: primary?.objectKey ?? null,
    },
  })

  return NextResponse.json({ ok: true, data: item })
}

export async function DELETE(req: Request) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get("productId")
  if (!productId) return NextResponse.json({ ok: false }, { status: 400 })

  await db.wishlistItem.deleteMany({ where: { userId: session.user.id, productId } })
  return NextResponse.json({ ok: true })
}
