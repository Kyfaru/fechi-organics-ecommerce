"use client"

import Link from "next/link"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useState, type CSSProperties, type MouseEvent } from "react"
import { Icon } from "@iconify/react"
import { ORDER_STATUS_CLIENT_LABELS, type OrderStatusValue } from "@/types/account"
import { ConfirmModal } from "@/components/ui/ConfirmModal"
import { toast } from "@/lib/toast"

// Mirrors the admin/customer cancel routes' CANCELLABLE_STATUSES — once an
// order has shipped or is ready for pickup, cancellation isn't offered here.
const CANCELLABLE_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "WAITING_TO_PACKAGE"]

interface OrderCardProps {
  id: string
  orderNumber: string | null
  status: string
  paymentStatus: string
  createdAt: string | Date
  totalKes: number
  thumbnails: string[]
  itemCount: number
  deliveryType: string
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:            "bg-yellow-50 text-yellow-700 border-yellow-200",
  CONFIRMED:          "bg-blue-50 text-blue-700 border-blue-200",
  PROCESSING:         "bg-orange-50 text-orange-700 border-orange-200",
  SHIPPED:            "bg-purple-50 text-purple-700 border-purple-200",
  DELIVERED:          "bg-green-50 text-[#15803D] border-green-200",
  PICKED_UP:          "bg-green-50 text-[#15803D] border-green-200",
  WAITING_TO_PACKAGE: "bg-orange-50 text-orange-700 border-orange-200",
  READY_FOR_PICKUP:   "bg-blue-50 text-blue-700 border-blue-200",
  CANCELLED:          "bg-red-50 text-red-600 border-red-200",
}

function fmt(date: string | Date) {
  return new Date(date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
}

function Thumbnail({ src, className = "", style }: { src?: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rounded-xl bg-neutral-100 overflow-hidden ${className}`} style={style}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
      )}
    </div>
  )
}

export default function OrderCard({ id, orderNumber, status, paymentStatus, createdAt, totalKes, thumbnails, itemCount, deliveryType }: OrderCardProps) {
  const router = useRouter()
  const label = ORDER_STATUS_CLIENT_LABELS[status as OrderStatusValue] ?? status
  const colorClass = STATUS_COLORS[status] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"
  const canDownload = status !== "CANCELLED" && status !== "FAILED" && paymentStatus === "PAID"
  const canCancel = CANCELLABLE_STATUSES.includes(status)
  const extraCount = itemCount - thumbnails.length

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  function openDocument(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    window.open(`/api/orders/${id}/invoice`, "_blank")
  }

  function openCancelConfirm(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setCancelConfirmOpen(true)
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch(`/api/orders/${id}/cancel`, { method: "POST" })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to cancel order")
      toast.success("Order cancelled")
      setCancelConfirmOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel order")
    } finally {
      setCancelling(false)
    }
  }

  const meta = (
    <>
      {fmt(createdAt)} · {itemCount} item{itemCount !== 1 ? "s" : ""}
      {deliveryType === "PICKUP" && " · Pickup"}
    </>
  )

  const docButtons = (
    <>
      <button
        onClick={openDocument}
        disabled={!canDownload}
        title="Download invoice"
        aria-label="Download invoice"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Icon icon="lucide:printer" width={14} />
      </button>
      <button
        onClick={openDocument}
        disabled={!canDownload}
        title="Download receipt"
        aria-label="Download receipt"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Icon icon="lucide:receipt" width={14} />
      </button>
      {canCancel && (
        <button
          onClick={openCancelConfirm}
          title="Cancel order"
          aria-label="Cancel order"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Icon icon="lucide:x-circle" width={14} />
        </button>
      )}
    </>
  )

  return (
    <>
    <Link
      href={`/account/orders/${id}`}
      className="relative block bg-white border border-neutral-200 rounded-xl hover:border-[#15803D]/40 hover:shadow-sm transition-all duration-150 group"
    >
      {/* ---------------- Mobile: 2-col grid (picture | text/status/buttons) ---------------- */}
      <div className="md:hidden grid grid-cols-[auto_1fr] gap-4 p-4">
        <span className={`absolute top-3 right-3 z-10 text-xs font-semibold px-2.5 py-1 rounded-full border ${colorClass}`}>
          {label}
        </span>

        {/* Picture column — fanned stack, primary product on top, up to 3 shown */}
        <div className="relative w-16 h-16 shrink-0">
          {thumbnails.length > 0 ? (
            thumbnails.slice(0, 3).map((src, i) => (
              <Thumbnail
                key={i}
                src={src}
                className="absolute inset-y-0 w-16 h-16 border-2 border-white shadow-sm"
                style={{ left: `${i * 8}px`, zIndex: 3 - i }}
              />
            ))
          ) : (
            <Thumbnail className="w-16 h-16" />
          )}
          {extraCount > 0 && (
            <span className="absolute -bottom-1 -right-1 z-10 min-w-[20px] h-5 px-1 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
              +{extraCount}
            </span>
          )}
        </div>

        {/* Text / status / buttons column */}
        <div className="min-w-0 pr-14">
          <p className="text-[15px] font-semibold text-neutral-900 truncate">
            {orderNumber ?? id.slice(-8).toUpperCase()}
          </p>
          <p className="text-sm text-neutral-400 mt-0.5">{fmt(createdAt)}</p>
          <p className="text-base font-bold text-neutral-900 mt-1">
            KES {(totalKes / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-neutral-400 mt-0.5">
            {itemCount} item{itemCount !== 1 ? "s" : ""}
            {deliveryType === "PICKUP" && " · Pickup"}
          </p>
          <div className="flex items-center gap-2 mt-2">{docButtons}</div>
        </div>
      </div>

      {/* ---------------- Desktop: horizontal row (unchanged) ---------------- */}
      <div className="hidden md:flex items-center gap-5 p-5">
        <Thumbnail src={thumbnails[0]} className="w-16 h-16 shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[15px] font-semibold text-neutral-900">
                {orderNumber ?? id.slice(-8).toUpperCase()}
              </p>
              <p className="text-sm text-neutral-400 mt-0.5">{meta}</p>
            </div>
            <span className={`shrink-0 text-sm font-semibold px-3 py-1 rounded-full border ${colorClass}`}>
              {label}
            </span>
          </div>
        </div>

        <div className="text-right shrink-0 flex items-center gap-2">
          <p className="text-base font-bold text-neutral-900">
            KES {(totalKes / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
          </p>
          {docButtons}
          <Icon icon="lucide:chevron-right" width={16} className="text-neutral-300 group-hover:text-[#15803D] transition-colors" />
        </div>
      </div>
    </Link>
    {/* Rendered via portal — a DOM descendant of the enclosing <Link> would
        bubble its button clicks into a navigation instead of just closing. */}
    {cancelConfirmOpen && typeof document !== "undefined" && createPortal(
      <ConfirmModal
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={handleCancel}
        title="Cancel this order?"
        description="This can't be undone. Contact us instead if you need to change the order rather than cancel it."
        confirmLabel="Cancel order"
        danger
        loading={cancelling}
      />,
      document.body
    )}
    </>
  )
}
