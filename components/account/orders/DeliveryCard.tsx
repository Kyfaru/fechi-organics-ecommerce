"use client"

import { Icon } from "@iconify/react"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import confetti from "canvas-confetti"

interface DeliveryCardProps {
  deliveryType: string
  deliveryAddress?: string | null
  deliveryCity?: string | null
  deliveryCounty?: string | null
  deliveryPhone?: string | null
  pickupCode?: string | null
  deliveryZone?: string | null
  branch?: { name: string; county: string; phone?: string | null } | null
  orderId?: string
  status?: string
  hasReview?: boolean
}

export default function DeliveryCard({
  deliveryType,
  deliveryAddress,
  deliveryCity,
  deliveryCounty,
  deliveryPhone,
  pickupCode,
  deliveryZone,
  branch,
  orderId,
  status,
  hasReview,
}: DeliveryCardProps) {
  const isPickup = deliveryType === "PICKUP"
  const qc = useQueryClient()

  const markDelivered = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/orders/${orderId}/delivered`, { method: "POST" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error?.message ?? "Failed to mark as delivered")
    },
    onSuccess: () => {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } })
      qc.invalidateQueries({ queryKey: ["order", orderId] })
      qc.invalidateQueries({ queryKey: ["account-orders"] })
    },
  })

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon icon={isPickup ? "lucide:map-pin" : "lucide:truck"} width={15} className="text-[#15803D]" />
        <h3 className="text-[13px] font-semibold text-neutral-700 uppercase tracking-wide">
          {isPickup ? "Pickup" : "Delivery"}
        </h3>
      </div>

      {isPickup ? (
        <div className="space-y-1.5 text-[13px] text-neutral-600">
          {branch?.name ? (
            <div className="space-y-1">
              <p className="font-semibold">{branch.name}</p>
              {branch.county && <p>{branch.county}</p>}
              {branch.phone && (
                <p className="text-neutral-400 text-[12px]">Branch: {branch.phone}</p>
              )}
            </div>
          ) : (
            <p>In-store pickup order</p>
          )}
          {pickupCode && (
            <div className="mt-2 p-3 bg-[#F0FDF4] border border-[#DCFCE7] rounded-lg">
              <p className="text-[11px] text-neutral-500 uppercase tracking-wide font-semibold mb-1">Pickup Code</p>
              <p className="text-xl font-mono font-bold text-[#15803D] tracking-widest">{pickupCode}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 text-[13px] text-neutral-600">
          {deliveryAddress && <p>{deliveryAddress}</p>}
          {(deliveryCity || deliveryCounty) && (
            <p>{[deliveryCity, deliveryCounty].filter(Boolean).join(", ")}</p>
          )}
          {deliveryPhone && (
            <p className="text-neutral-400 text-[12px] mt-1">Contact: {deliveryPhone}</p>
          )}
          {deliveryZone && (
            <p className="text-neutral-400 text-[12px]">Zone: {deliveryZone}</p>
          )}

          {/* Mark as Delivered button — shown when SHIPPED */}
          {status === "SHIPPED" && orderId && (
            <button
              onClick={() => {
                if (window.confirm("Confirm you have received this delivery?")) {
                  markDelivered.mutate()
                }
              }}
              disabled={markDelivered.isPending}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#16A34A] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {markDelivered.isPending ? (
                <>
                  <Icon icon="lucide:loader-2" width={14} className="animate-spin" />
                  Updating…
                </>
              ) : (
                <>
                  <Icon icon="lucide:check-circle" width={14} />
                  Mark as Delivered
                </>
              )}
            </button>
          )}

          {/* Write a Review button — shown when DELIVERED and not yet reviewed */}
          {status === "DELIVERED" && orderId && !hasReview && (
            <Link
              href={`/account/reviews/${orderId}`}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#15803D] text-[#15803D] hover:bg-[#f0fdf4] text-sm font-semibold transition-colors"
            >
              <Icon icon="lucide:star" width={14} />
              Write a Review
            </Link>
          )}

          {/* Reviewed chip — shown when DELIVERED and already reviewed */}
          {status === "DELIVERED" && hasReview && (
            <div className="mt-3 flex items-center gap-2 text-[#15803D] text-sm font-semibold">
              <Icon icon="lucide:check-circle" width={14} />
              Reviewed
            </div>
          )}
        </div>
      )}
    </div>
  )
}
