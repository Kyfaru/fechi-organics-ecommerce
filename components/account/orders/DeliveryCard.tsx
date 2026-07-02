"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import confetti from "canvas-confetti"
import { ConfirmModal } from "@/components/ui/ConfirmModal"

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
  pickedUpAt?: string | null
  customerPickupConfirmedAt?: string | null
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
  pickedUpAt,
  customerPickupConfirmedAt,
}: DeliveryCardProps) {
  const isPickup = deliveryType === "PICKUP"
  const qc = useQueryClient()
  const [pickupConfirmOpen, setPickupConfirmOpen] = useState(false)
  const [deliveredConfirmOpen, setDeliveredConfirmOpen] = useState(false)

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

  const markPickedUp = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/orders/${orderId}/picked-up`, { method: "POST" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error?.message ?? "Failed to mark as picked up")
      return j.data as { customerPickupConfirmedAt: string; completed: boolean; pickedUpAt: string | null }
    },
    onSuccess: (data) => {
      // Only celebrate once BOTH parties (customer + staff) have confirmed — a customer-only
      // confirmation leaves the order at READY_FOR_PICKUP until staff confirms their side too.
      if (data.completed) {
        confetti({ particleCount: 100, spread: 60, origin: { y: 0.6 } })
      }
      qc.invalidateQueries({ queryKey: ["order", orderId] })
      qc.invalidateQueries({ queryKey: ["account-orders"] })
    },
  })

  // Review eligibility: pickup orders need 4 days after pickup
  const canReview = (() => {
    if (hasReview) return false
    if (isPickup) {
      if (status !== "PICKED_UP" || !pickedUpAt) return false
      return Date.now() - new Date(pickedUpAt).getTime() >= 4 * 24 * 60 * 60 * 1000
    }
    return status === "DELIVERED"
  })()

  const daysUntilReview = (() => {
    if (!isPickup || !pickedUpAt || status !== "PICKED_UP" || hasReview) return null
    const msLeft = 4 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(pickedUpAt).getTime())
    if (msLeft <= 0) return null
    return Math.ceil(msLeft / (24 * 60 * 60 * 1000))
  })()

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

          {/* Mark as Picked Up button — hidden once the customer's half is already confirmed
              (order stays READY_FOR_PICKUP until staff independently confirms their side) */}
          {status === "READY_FOR_PICKUP" && orderId && !customerPickupConfirmedAt && (
            <button
              onClick={() => setPickupConfirmOpen(true)}
              disabled={markPickedUp.isPending}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#16A34A] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {markPickedUp.isPending ? (
                <><Icon icon="lucide:loader-2" width={14} className="animate-spin" />Updating…</>
              ) : (
                <><Icon icon="lucide:package-check" width={14} />Mark as Picked Up</>
              )}
            </button>
          )}

          {/* Waiting on staff — customer has confirmed their half, staff hasn't confirmed yet */}
          {status === "READY_FOR_PICKUP" && orderId && customerPickupConfirmedAt && (
            <div className="mt-3 flex items-start gap-2 text-[12px] text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-lg p-3">
              <Icon icon="lucide:clock" width={13} className="mt-0.5 shrink-0 text-neutral-400" />
              <span>You&apos;ve confirmed pickup — waiting for staff to confirm on their end.</span>
            </div>
          )}

          {/* Post-pickup: review pending message */}
          {status === "PICKED_UP" && daysUntilReview !== null && (
            <div className="mt-3 flex items-start gap-2 text-[12px] text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-lg p-3">
              <Icon icon="lucide:clock" width={13} className="mt-0.5 shrink-0 text-neutral-400" />
              <span>
                Come back in <strong>{daysUntilReview} {daysUntilReview === 1 ? "day" : "days"}</strong> to leave a review. We&apos;ll send you a reminder!
              </span>
            </div>
          )}

          {/* Write a Review — pickup, 4 days passed */}
          {canReview && orderId && isPickup && (
            <Link
              href={`/account/reviews/${orderId}`}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#15803D] text-[#15803D] hover:bg-[#f0fdf4] text-sm font-semibold transition-colors"
            >
              <Icon icon="lucide:star" width={14} />
              Write a Review
            </Link>
          )}

          {/* Reviewed chip — pickup */}
          {status === "PICKED_UP" && hasReview && (
            <div className="mt-3 flex items-center gap-2 text-[#15803D] text-sm font-semibold">
              <Icon icon="lucide:check-circle" width={14} />
              Reviewed
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
              onClick={() => setDeliveredConfirmOpen(true)}
              disabled={markDelivered.isPending}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#16A34A] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {markDelivered.isPending ? (
                <><Icon icon="lucide:loader-2" width={14} className="animate-spin" />Updating…</>
              ) : (
                <><Icon icon="lucide:check-circle" width={14} />Mark as Delivered</>
              )}
            </button>
          )}

          {/* Write a Review — delivery */}
          {canReview && orderId && !isPickup && (
            <Link
              href={`/account/reviews/${orderId}`}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#15803D] text-[#15803D] hover:bg-[#f0fdf4] text-sm font-semibold transition-colors"
            >
              <Icon icon="lucide:star" width={14} />
              Write a Review
            </Link>
          )}

          {/* Reviewed chip — delivery */}
          {status === "DELIVERED" && hasReview && (
            <div className="mt-3 flex items-center gap-2 text-[#15803D] text-sm font-semibold">
              <Icon icon="lucide:check-circle" width={14} />
              Reviewed
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={pickupConfirmOpen}
        onClose={() => setPickupConfirmOpen(false)}
        onConfirm={() => {
          markPickedUp.mutate()
          setPickupConfirmOpen(false)
        }}
        title="Confirm Pickup"
        description="Confirm you have collected your order?"
        confirmLabel="Confirm"
        loading={markPickedUp.isPending}
      />

      <ConfirmModal
        open={deliveredConfirmOpen}
        onClose={() => setDeliveredConfirmOpen(false)}
        onConfirm={() => {
          markDelivered.mutate()
          setDeliveredConfirmOpen(false)
        }}
        title="Confirm Delivery"
        description="Confirm you have received this delivery?"
        confirmLabel="Confirm"
        loading={markDelivered.isPending}
      />
    </div>
  )
}
