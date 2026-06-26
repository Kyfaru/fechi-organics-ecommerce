"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"
import { ORDER_STATUS_CLIENT_LABELS, type OrderStatusValue } from "@/types/account"
import OrderStepper from "./OrderStepper"
import PaymentCard from "./PaymentCard"
import DeliveryCard from "./DeliveryCard"

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

interface OrderItem {
  id: string
  name: string
  priceKes: number
  quantity: number
  imageUrl: string | null
}

interface Transaction {
  id: string
  provider: string
  amount: number
  status: string
  mpesaReceiptNumber?: string | null
  createdAt: string
}

interface StatusEvent {
  status: string
  occurredAt: string
  note?: string | null
}

interface Order {
  id: string
  orderNumber: string | null
  status: string
  createdAt: string
  totalKes: number
  subtotalKes: number
  deliveryKes: number
  discountKes: number
  deliveryType: string
  deliveryAddress?: string | null
  deliveryCity?: string | null
  deliveryCounty?: string | null
  deliveryPhone?: string | null
  pickupCode?: string | null
  items: OrderItem[]
  transactions: Transaction[]
  statusEvents: StatusEvent[]
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
}

export default function OrderDetailContent({ order }: { order: Order }) {
  const label = ORDER_STATUS_CLIENT_LABELS[order.status as OrderStatusValue] ?? order.status
  const colorClass = STATUS_COLORS[order.status] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + header */}
      <div>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-[#15803D] transition-colors mb-4"
        >
          <Icon icon="lucide:arrow-left" width={13} />
          Back to Orders
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">
              Order #{order.orderNumber ?? order.id.slice(-8).toUpperCase()}
            </h1>
            <p className="text-sm text-neutral-400 mt-0.5">Placed {fmt(order.createdAt)}</p>
          </div>
          <span className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border ${colorClass}`}>
            {label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left: items + stepper */}
        <div className="space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
              <Icon icon="lucide:package" width={14} className="text-[#15803D]" />
              <h2 className="text-[13px] font-semibold text-neutral-700 uppercase tracking-wide">
                Items ({order.items.length})
              </h2>
            </div>
            <div className="divide-y divide-neutral-100">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-12 h-12 rounded-lg bg-neutral-100 shrink-0 overflow-hidden">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-300 text-lg">🌿</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-neutral-900 truncate">{item.name}</p>
                    <p className="text-[12px] text-neutral-400">Qty: {item.quantity}</p>
                  </div>
                  <p className="text-[13px] font-semibold text-neutral-900 shrink-0">
                    KES {(item.priceKes / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <Icon icon="lucide:map" width={14} className="text-[#15803D]" />
              <h2 className="text-[13px] font-semibold text-neutral-700 uppercase tracking-wide">Order Progress</h2>
            </div>
            <OrderStepper
              currentStatus={order.status}
              deliveryType={order.deliveryType}
              statusEvents={order.statusEvents}
            />
          </div>
        </div>

        {/* Right: payment + delivery */}
        <div className="space-y-4">
          <PaymentCard
            transactions={order.transactions}
            totalKes={order.totalKes}
            subtotalKes={order.subtotalKes}
            deliveryKes={order.deliveryKes}
            discountKes={order.discountKes}
          />
          <DeliveryCard
            deliveryType={order.deliveryType}
            deliveryAddress={order.deliveryAddress}
            deliveryCity={order.deliveryCity}
            deliveryCounty={order.deliveryCounty}
            deliveryPhone={order.deliveryPhone}
            pickupCode={order.pickupCode}
          />
        </div>
      </div>
    </div>
  )
}
