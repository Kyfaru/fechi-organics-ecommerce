"use client"

import Link from "next/link"
import { useState } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

interface WishlistItemProps {
  id: string
  productId: string
  productName: string
  productSlug?: string
  productImage: string | null
  priceKes: number
  originalPriceKes: number | null
  addedAt: string | Date
  onRemove: (productId: string) => void
}

export default function WishlistItem({
  productId,
  productName,
  productSlug,
  productImage,
  priceKes,
  originalPriceKes,
  onRemove,
}: WishlistItemProps) {
  const productHref = productSlug ? `/shop/${productSlug}` : `/shop/${productId}`
  const [removing, setRemoving] = useState(false)
  const discount = originalPriceKes && originalPriceKes > priceKes
    ? Math.round(((originalPriceKes - priceKes) / originalPriceKes) * 100)
    : null

  async function handleRemove() {
    setRemoving(true)
    try {
      await fetch(`/api/account/wishlist?productId=${productId}`, { method: "DELETE" })
      onRemove(productId)
    } catch {
      toast.error("Could not remove item")
      setRemoving(false)
    }
  }

  function fmt(n: number) {
    return (n / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })
  }

  return (
    <div className="flex gap-5 bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-300 transition-colors group">
      {/* Image */}
      <Link href={productHref} className="shrink-0">
        <div className="w-24 h-24 rounded-xl bg-neutral-100 overflow-hidden">
          {productImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productImage} alt={productName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon icon="lucide:leaf" width={22} className="text-neutral-300" />
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link href={`/shop/${productId}`}>
          <p className="text-[15px] font-semibold text-neutral-900 hover:text-[#15803D] transition-colors truncate">
            {productName}
          </p>
        </Link>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-base font-bold text-neutral-900">KES {fmt(priceKes)}</span>
          {originalPriceKes && originalPriceKes > priceKes && (
            <span className="text-[12px] text-neutral-400 line-through">KES {fmt(originalPriceKes)}</span>
          )}
          {discount && (
            <span className="text-[11px] font-bold text-[#15803D] bg-green-50 px-1.5 py-0.5 rounded-full">
              -{discount}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Link
            href={productHref}
            className="px-4 py-1.5 rounded-lg bg-[#15803D] text-white text-[12px] font-semibold hover:bg-[#16A34A] transition-colors"
          >
            View Product
          </Link>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            aria-label="Remove from wishlist"
          >
            <Icon icon={removing ? "lucide:loader-2" : "lucide:trash-2"} width={14} className={removing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
    </div>
  )
}
