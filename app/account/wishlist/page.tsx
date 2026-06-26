import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { r2PublicUrl } from "@/lib/r2"
import PageHeader from "@/components/account/PageHeader"
import WishlistClient from "@/components/account/wishlist/WishlistClient"

export default async function WishlistPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  // Use existing favorite model (ProductCard already writes here)
  const favorites = await db.favorite.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        include: {
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
  })

  const items = favorites.map((f) => ({
    id: f.productId,
    productId: f.productId,
    productName: f.product.name,
    productSlug: f.product.slug,
    productImage: f.product.images[0]?.objectKey
      ? r2PublicUrl(f.product.images[0].objectKey)
      : null,
    priceKes: f.product.priceKes,
    originalPriceKes: f.product.compareAtPriceKes ?? null,
    addedAt: f.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        icon="lucide:heart"
        eyebrow="Saved Products"
        title="Wishlist"
        description={items.length > 0 ? `${items.length} saved item${items.length !== 1 ? "s" : ""}` : undefined}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4 text-3xl">
            🤍
          </div>
          <p className="text-neutral-500 font-medium">Your wishlist is empty</p>
          <p className="text-sm text-neutral-400 mt-1">Tap the heart on any product to save it here.</p>
          <Link
            href="/shop"
            className="mt-4 px-5 py-2 rounded-lg bg-[#15803D] text-white text-sm font-medium hover:bg-[#16A34A] transition-colors"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <WishlistClient initialItems={items} />
      )}
    </div>
  )
}
