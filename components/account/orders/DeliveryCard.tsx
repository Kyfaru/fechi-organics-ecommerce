import { Icon } from "@iconify/react"

interface DeliveryCardProps {
  deliveryType: string
  deliveryAddress?: string | null
  deliveryCity?: string | null
  deliveryCounty?: string | null
  deliveryPhone?: string | null
  pickupCode?: string | null
}

export default function DeliveryCard({
  deliveryType,
  deliveryAddress,
  deliveryCity,
  deliveryCounty,
  deliveryPhone,
  pickupCode,
}: DeliveryCardProps) {
  const isPickup = deliveryType === "PICKUP"

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
          <p>In-store pickup order</p>
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
        </div>
      )}
    </div>
  )
}
