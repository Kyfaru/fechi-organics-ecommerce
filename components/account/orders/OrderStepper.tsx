"use client"

import { Icon } from "@iconify/react"
import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import type { OrderStatusValue } from "@/types/account"
import { ORDER_STATUS_CLIENT_LABELS } from "@/types/account"

type StatusEvent = { status: string; occurredAt: string | Date; note?: string | null }

const DELIVERY_FLOW: OrderStatusValue[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]
const PICKUP_FLOW: OrderStatusValue[] = ["PENDING", "CONFIRMED", "WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP"]

const STEP_ICONS: Partial<Record<OrderStatusValue, string>> = {
  PENDING:            "lucide:clock",
  CONFIRMED:          "lucide:check-circle",
  PROCESSING:         "lucide:package",
  SHIPPED:            "lucide:truck",
  DELIVERED:          "lucide:home",
  WAITING_TO_PACKAGE: "lucide:package",
  READY_FOR_PICKUP:   "lucide:map-pin",
  PICKED_UP:          "lucide:check-circle",
}

export default function OrderStepper({
  currentStatus,
  deliveryType,
  statusEvents = [],
}: {
  currentStatus: string
  deliveryType: string
  statusEvents?: StatusEvent[]
}) {
  const flow = deliveryType === "PICKUP" ? PICKUP_FLOW : DELIVERY_FLOW

  // Track status transitions (not just renders/refetches) so the connector "liquid fill"
  // animation only plays when a step's done-state actually changes — never on initial mount
  // of an already-progressed order (DeliveryCard's invalidateQueries triggers a refetch that
  // passes a new statusEvents/currentStatus, which would otherwise look like a fresh mount).
  // Hooks must run unconditionally on every render, so this lives above the CANCELLED
  // early-return below (Rules of Hooks).
  const prevStatusRef = useRef<string | null>(null)
  const isFirstRender = useRef(true)
  const [transitionFromIdx, setTransitionFromIdx] = useState<number | null>(null)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      prevStatusRef.current = currentStatus
      return
    }
    if (prevStatusRef.current !== currentStatus) {
      const prevIdx = Math.max(0, flow.indexOf(prevStatusRef.current as OrderStatusValue))
      setTransitionFromIdx(prevIdx)
      prevStatusRef.current = currentStatus
    }
  }, [currentStatus, flow])

  if (currentStatus === "CANCELLED") {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
        <Icon icon="lucide:x-circle" width={18} className="text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-700">Order Cancelled</p>
          {statusEvents.find(e => e.status === "CANCELLED")?.note && (
            <p className="text-xs text-red-500 mt-0.5">{statusEvents.find(e => e.status === "CANCELLED")?.note}</p>
          )}
        </div>
      </div>
    )
  }

  // Defense-in-depth: if currentStatus isn't a member of this order's flow (e.g. a stray
  // legacy write), indexOf returns -1 — clamp so we never treat every step as not-done.
  const currentIdx = Math.max(0, flow.indexOf(currentStatus as OrderStatusValue))
  // Primary source of truth: a step is done if we have a recorded status event for it, or
  // for any status later in the flow — this doesn't depend on currentIdx at all, so a bad/
  // out-of-flow currentStatus can no longer make earlier, already-confirmed steps regress.
  const occurredStatuses = new Set(statusEvents.map(e => e.status))

  return (
    <div className="space-y-0">
      {flow.map((step, idx) => {
        const statusEventDone = flow.slice(idx).some(s => occurredStatuses.has(s))
        const done = statusEventDone || idx <= currentIdx
        const active = idx === currentIdx
        const event = statusEvents.find(e => e.status === step)
        const icon = STEP_ICONS[step] ?? "lucide:circle"
        const isLast = idx === flow.length - 1
        // Only animate the connectors that newly became done as part of the most recent
        // transition — idx === transitionFromIdx was already filled before this transition,
        // so it's excluded to avoid replaying its fill on an already-complete connector.
        const shouldAnimate =
          done && transitionFromIdx !== null && idx > transitionFromIdx && idx <= currentIdx

        return (
          <div key={step} className="flex gap-4">
            {/* Icon + line */}
            <div className="flex flex-col items-center">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all",
                  done
                    ? "bg-[#15803D] text-white"
                    : "bg-neutral-100 text-neutral-300",
                  active ? "ring-2 ring-[#15803D]/30" : "",
                ].join(" ")}
              >
                <Icon icon={icon} width={14} />
              </div>
              {!isLast && (
                <div className="relative w-0.5 flex-1 my-1 overflow-hidden bg-neutral-200" style={{ minHeight: 24 }}>
                  {done && (
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        transformOrigin: "top",
                        backgroundImage: "linear-gradient(180deg, #15803D 0%, #4ade80 50%, #15803D 100%)",
                        backgroundSize: "100% 200%",
                      }}
                      initial={shouldAnimate ? { scaleY: 0, backgroundPosition: "0% 0%" } : false}
                      animate={{
                        scaleY: 1,
                        backgroundPosition: shouldAnimate ? ["0% 0%", "0% 100%"] : "0% 0%",
                      }}
                      transition={
                        shouldAnimate
                          ? {
                              scaleY: { duration: 0.6, ease: "easeOut" },
                              backgroundPosition: { duration: 0.9, ease: "easeInOut" },
                            }
                          : { duration: 0 }
                      }
                    />
                  )}
                </div>
              )}
            </div>

            {/* Label */}
            <div className={`pb-5 flex-1 ${isLast ? "pb-0" : ""}`}>
              <p className={`text-[13px] font-semibold leading-tight ${done ? "text-neutral-900" : "text-neutral-400"}`}>
                {ORDER_STATUS_CLIENT_LABELS[step]}
              </p>
              {event ? (
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  {new Date(event.occurredAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {event.note && ` · ${event.note}`}
                </p>
              ) : done ? (
                <p className="text-[11px] text-neutral-400 mt-0.5">Completed</p>
              ) : (
                <p className="text-[11px] text-neutral-300 mt-0.5">Pending</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
