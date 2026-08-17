"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DeleteOrderModal } from "@/components/admin/AdminOrdersClient";

export type InStoreFulfillmentOrder = {
  id: string;
  orderNumber: string | null;
  paymentStatus: string;
  fulfillmentStatus: "CONFIRMED" | "PICKED_UP";
  pickedUpAt: string | null;
};

// Mirrors InStoreOrderDrawerContent's fulfillment block in AdminOrdersClient.tsx
// (the 2-step CONFIRMED -> PICKED_UP flow, no other in-store transitions exist).
export function InStoreFulfillmentPanel({
  order,
  isSuperAdmin,
}: {
  order: InStoreFulfillmentOrder;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmPickupOpen, setConfirmPickupOpen] = useState(false);

  const pickupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/orders/instore/${order.id}/pickup`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Update failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Order marked picked up");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isPaid = order.paymentStatus === "PAID";
  const isPickedUp = order.fulfillmentStatus === "PICKED_UP";

  return (
    <>
      <div className="bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
        <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-4">Fulfillment</p>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-[6px] bg-(--green-800) flex items-center justify-center shrink-0">
              <Icon icon="lucide:check" width={13} className="text-white" />
            </div>
            <div>
              <p className="font-dm text-[14px] font-medium text-(--neutral-900)">Confirmed</p>
              <p className="font-dm text-[12px] text-(--neutral-500)">{isPaid ? "Paid — ready for pickup" : "Awaiting payment confirmation"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 pl-8">
            {isPickedUp ? (
              <div className="flex items-center gap-2 text-[#15803D]">
                <Icon icon="lucide:check-circle" width={16} />
                <p className="font-dm text-[13px] font-semibold">
                  Picked up{order.pickedUpAt ? ` — ${new Date(order.pickedUpAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              </div>
            ) : (
              <button
                disabled={!isPaid || pickupMutation.isPending}
                onClick={() => setConfirmPickupOpen(true)}
                className="px-4 py-2 text-[13px] font-medium rounded-[8px] bg-[#15803D] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#16A34A] transition-colors flex items-center gap-1.5"
              >
                {pickupMutation.isPending ? <Spinner size={12} /> : <Icon icon="lucide:check" width={13} />}
                Confirm Pickup
              </button>
            )}
          </div>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="flex flex-col gap-2 mt-3">
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="w-full h-9 rounded-[8px] font-dm text-[12px] text-(--danger) hover:bg-(--danger-bg) flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icon icon="lucide:x" width={13} /> Delete Permanently
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmPickupOpen}
        onClose={() => setConfirmPickupOpen(false)}
        onConfirm={() => { pickupMutation.mutate(); setConfirmPickupOpen(false); }}
        title="Confirm handover?"
        description="Confirm you have handed over this order to the customer."
        confirmLabel="Confirm Pickup"
        loading={pickupMutation.isPending}
      />

      <DeleteOrderModal
        order={{ id: order.id, orderNumber: order.orderNumber }}
        kind="instore"
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={() => router.push("/admin/orders")}
      />
    </>
  );
}
