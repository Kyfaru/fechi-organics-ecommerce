"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import CheckboxGreen from "@/components/ui/CheckboxGreen";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DeleteOrderModal } from "@/components/admin/AdminOrdersClient";

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export type FulfillmentOrder = {
  id: string;
  orderNumber: string | null;
  status: string;
  deliveryType: "PICKUP" | "DELIVERY" | string;
  processingBy: string | null;
  processedAt: string | null;
  staffPickupConfirmedAt: string | null;
};

// Small standalone order-number confirmation gate — deliberately not reusing
// AdminOrdersClient's private ConfirmOrderModal, which is tied to that
// file's own AdminOrder type; this only needs the order number.
function OrderNumberGateModal({
  orderNumber,
  open,
  onClose,
  onConfirm,
  loading,
}: {
  orderNumber: string | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (orderNumber: string) => void;
  loading: boolean;
}) {
  const [typedNumber, setTypedNumber] = useState("");
  if (!open) return null;
  const orderNum = orderNumber ?? "";
  const isMatch = typedNumber.trim() === orderNum;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-(--dark-surface) rounded-[16px] w-full max-w-[420px] mx-4 shadow-xl p-6">
        <h3 className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-2">
          Confirm Order
        </h3>
        <p className="font-dm text-[13px] text-(--neutral-500) mb-4">
          Type the order number below to confirm you have the correct order.
        </p>
        <div className="flex items-center gap-2 bg-(--neutral-50) border border-(--neutral-200) rounded-[10px] px-4 py-3 mb-4">
          <span className="font-mono text-[16px] font-bold text-(--neutral-900) flex-1">{orderNum}</span>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(orderNum); toast.success("Copied"); }}
            className="text-(--neutral-400) hover:text-(--neutral-700) transition-colors"
            title="Copy order number"
          >
            <Icon icon="lucide:copy" width={15} />
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (isMatch) onConfirm(typedNumber.trim()); }}
          className="flex flex-col gap-3"
        >
          <input
            autoFocus
            type="text"
            placeholder="Type order number to confirm"
            value={typedNumber}
            onChange={(e) => setTypedNumber(e.target.value)}
            className="w-full h-10 px-3 rounded-[8px] border border-(--neutral-300) font-dm text-[14px] text-(--neutral-900) outline-none focus:border-(--green-600) transition-colors placeholder:text-(--neutral-400)"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isMatch || loading}
              className="h-10 px-5 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FulfillmentPanel({
  order,
  isSuperAdmin,
}: {
  order: FulfillmentOrder;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [confirmModal1Open, setConfirmModal1Open] = useState(false);
  const [confirmModal2Open, setConfirmModal2Open] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingGateAction, setPendingGateAction] = useState<"set_processing" | "set_packaging" | null>(null);

  const fulfillMutation = useMutation({
    mutationFn: async ({ action, orderNumber }: { action: string; orderNumber?: string }) => {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(orderNumber ? { orderNumber } : {}) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Update failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleFulfillment(action: string, orderNumber?: string) {
    fulfillMutation.mutate({ action, orderNumber });
  }

  const isConfirmed = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status);
  const isProcessed = !!order.processingBy && ["PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status);

  return (
    <>
      <div
        className={`bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200) ${
          order.status === "FAILED" || order.status === "CANCELLED" ? "pointer-events-none opacity-50" : ""
        }`}
      >
        <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-4">Fulfillment</p>

        <div className="flex flex-col gap-4">
          {/* Step 1: Confirmed — read-only, driven by payment webhook */}
          <div className="flex items-center gap-3">
            <CheckboxGreen checked={isConfirmed} onChange={() => {}} disabled />
            <div>
              <p className="font-dm text-[14px] font-medium text-(--neutral-900)">Confirmed</p>
              {order.status === "FAILED" ? (
                <p className="font-dm text-[12px] text-(--danger)">Payment failed — order not confirmed</p>
              ) : isConfirmed ? (
                <p className="font-dm text-[12px] text-(--neutral-500)">Confirmed</p>
              ) : (
                <p className="font-dm text-[12px] text-(--neutral-400)">Awaiting payment confirmation</p>
              )}
            </div>
          </div>

          {order.deliveryType === "PICKUP" ? (
            <>
              <div className="flex items-center gap-3">
                <CheckboxGreen
                  checked={["WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP"].includes(order.status)}
                  onChange={() => {
                    if (!["WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP"].includes(order.status)) {
                      setPendingGateAction("set_packaging");
                      setConfirmModal1Open(true);
                    }
                  }}
                  disabled={fulfillMutation.isPending || !isConfirmed || ["WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP", "CANCELLED"].includes(order.status)}
                />
                <div>
                  <p className="font-dm text-[14px] font-medium text-(--neutral-900)">Prepare Package</p>
                  <p className="font-dm text-[12px] text-(--neutral-400)">
                    {["WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP"].includes(order.status) ? "Package preparation started" : "Start preparing the customer's package"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pl-[52px]">
                <button
                  disabled={order.status !== "WAITING_TO_PACKAGE" || fulfillMutation.isPending}
                  onClick={() => { if (window.confirm("Mark this order as ready for pickup?")) handleFulfillment("set_ready"); }}
                  className="px-4 py-2 text-[13px] font-medium rounded-[8px] bg-amber-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-600 transition-colors flex items-center gap-1.5"
                >
                  {fulfillMutation.isPending ? <Spinner size={12} /> : <Icon icon="lucide:map-pin" width={13} />}
                  Ready for Pickup
                </button>
              </div>

              {order.status === "READY_FOR_PICKUP" && order.staffPickupConfirmedAt ? (
                <div className="flex items-center gap-3 pl-[52px]">
                  <div className="bg-(--neutral-50) border border-(--neutral-200) rounded-[8px] px-3 py-2 flex items-center gap-2">
                    <Icon icon="lucide:clock" width={14} className="text-(--neutral-400) shrink-0" />
                    <p className="font-dm text-[12px] text-(--neutral-500)">
                      Staff confirmed handover — waiting for customer to confirm pickup
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 pl-[52px]">
                  <button
                    disabled={order.status !== "READY_FOR_PICKUP" || fulfillMutation.isPending}
                    onClick={() => { if (window.confirm("Confirm you have handed over this order to the customer?")) handleFulfillment("set_picked_up"); }}
                    className="px-4 py-2 text-[13px] font-medium rounded-[8px] bg-[#15803D] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#16A34A] transition-colors flex items-center gap-1.5"
                  >
                    {fulfillMutation.isPending ? <Spinner size={12} /> : <Icon icon="lucide:check" width={13} />}
                    Confirm Pickup (Staff)
                  </button>
                </div>
              )}

              {order.status === "PICKED_UP" && (
                <div className="flex items-center gap-2 text-[#15803D]">
                  <Icon icon="lucide:check-circle" width={16} />
                  <p className="font-dm text-[13px] font-semibold">Order picked up</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <CheckboxGreen
                  checked={isProcessed}
                  onChange={() => {
                    if (isProcessed) handleFulfillment("unset_processing");
                    else { setPendingGateAction("set_processing"); setConfirmModal1Open(true); }
                  }}
                  disabled={fulfillMutation.isPending || !isConfirmed || ["SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status)}
                />
                <div>
                  <p className="font-dm text-[14px] font-medium text-(--neutral-900)">Processing</p>
                  {isProcessed ? (
                    <p className="font-dm text-[12px] text-(--neutral-500)">Packaging started {formatDateTime(order.processedAt)}</p>
                  ) : (
                    <p className="font-dm text-[12px] text-(--neutral-400)">Waiting to be packaged / shipped</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 pl-[52px]">
                <button
                  disabled={order.status !== "PROCESSING" || fulfillMutation.isPending}
                  onClick={() => { if (window.confirm("Mark this order as shipped?")) handleFulfillment("ship"); }}
                  className="px-4 py-2 text-[13px] font-medium rounded-[8px] bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                >
                  {fulfillMutation.isPending ? <Spinner size={12} /> : <Icon icon="lucide:truck" width={13} />}
                  Mark Shipped
                </button>
              </div>

              <div className="flex items-center gap-3 opacity-70">
                <div className="w-10 h-10 rounded-full border-2 border-dashed border-(--neutral-300) flex items-center justify-center shrink-0">
                  {order.status === "DELIVERED"
                    ? <Icon icon="lucide:check" className="w-5 h-5 text-green-500" />
                    : <span className="text-[11px] text-(--neutral-400)">—</span>
                  }
                </div>
                <p className="font-dm text-[13px] text-(--neutral-500)">
                  {order.status === "SHIPPED" ? "Awaiting customer confirmation" : order.status === "DELIVERED" ? "Delivered" : "Not shipped yet"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="flex flex-col gap-2 mt-3">
        {["PENDING", "CONFIRMED", "PROCESSING", "WAITING_TO_PACKAGE"].includes(order.status) && (
          <button
            onClick={() => setCancelConfirmOpen(true)}
            className="w-full h-9 rounded-[8px] font-dm text-[12px] text-(--danger) hover:bg-(--danger-bg) flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icon icon="lucide:x" width={13} /> Cancel Order
          </button>
        )}
        {isSuperAdmin && (
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="w-full h-9 rounded-[8px] font-dm text-[12px] text-(--danger) hover:bg-(--danger-bg) flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icon icon="lucide:x" width={13} /> Delete Permanently
          </button>
        )}
      </div>

      <ConfirmModal
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={() => { handleFulfillment("cancel"); setCancelConfirmOpen(false); }}
        title="Cancel this order?"
        description="This will mark the order as cancelled. The customer will need to be notified separately."
        confirmLabel="Cancel Order"
        danger
        loading={fulfillMutation.isPending}
      />

      <ConfirmModal
        open={confirmModal1Open}
        onClose={() => { setConfirmModal1Open(false); setPendingGateAction(null); }}
        onConfirm={() => { setConfirmModal1Open(false); setConfirmModal2Open(true); }}
        title="Proceed with this order?"
        description="Are you sure you want to proceed? You will need to enter the order number to continue."
        confirmLabel="Yes, continue"
        loading={false}
      />

      <OrderNumberGateModal
        orderNumber={order.orderNumber}
        open={confirmModal2Open}
        onClose={() => { setConfirmModal2Open(false); setPendingGateAction(null); }}
        onConfirm={(orderNumber) => {
          setConfirmModal2Open(false);
          if (pendingGateAction) handleFulfillment(pendingGateAction, orderNumber);
          setPendingGateAction(null);
        }}
        loading={fulfillMutation.isPending}
      />

      <DeleteOrderModal
        order={{ id: order.id, orderNumber: order.orderNumber }}
        kind="order"
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={() => router.push("/admin/orders")}
      />
    </>
  );
}
