import { Icon } from "@iconify/react"
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

  const flow = deliveryType === "PICKUP" ? PICKUP_FLOW : DELIVERY_FLOW
  const currentIdx = flow.indexOf(currentStatus as OrderStatusValue)

  return (
    <div className="space-y-0">
      {flow.map((step, idx) => {
        const done = idx <= currentIdx
        const active = idx === currentIdx
        const event = statusEvents.find(e => e.status === step)
        const icon = STEP_ICONS[step] ?? "lucide:circle"
        const isLast = idx === flow.length - 1

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
                <div className={`w-0.5 flex-1 my-1 ${done ? "bg-[#15803D]" : "bg-neutral-200"}`} style={{ minHeight: 24 }} />
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
