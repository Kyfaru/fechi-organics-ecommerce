"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"
import Link from "next/link"
import WishlistItem from "./WishlistItem"

interface Item {
  id: string
  productId: string
  productName: string
  productSlug?: string
  productImage: string | null
  priceKes: number
  originalPriceKes: number | null
  addedAt: string
}

export default function WishlistClient({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState(initialItems)

  function handleRemove(productId: string) {
    setItems((prev) => prev.filter((i) => i.productId !== productId))
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
          <Icon icon="lucide:heart" width={24} className="text-neutral-300" />
        </div>
        <p className="text-neutral-500 font-medium">Your wishlist is empty</p>
        <p className="text-sm text-neutral-400 mt-1">Save products you love to find them easily later.</p>
        <Link
          href="/shop"
          className="mt-4 px-5 py-2 rounded-lg bg-[#15803D] text-white text-sm font-medium hover:bg-[#16A34A] transition-colors"
        >
          Browse Products
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <WishlistItem key={item.id} {...item} onRemove={handleRemove} />
      ))}
    </div>
  )
}
