"use client";

/**
 * PaymentWaitingModal — shared non-dismissible "waiting for payment
 * confirmation" modal used by both the M-Pesa Prompt (STK push) and Card
 * (Paystack) panels in the in-store order wizard. Drives its own
 * useInStorePaymentStream(inStoreOrderId) subscription and reports status
 * transitions upward via callbacks — it deliberately does not own any order
 * data itself (the calling panel already has the order number from its
 * initiate/initialize call).
 *
 * Unlike ConfirmModal, this modal is intentionally NOT dismissible: no
 * backdrop-click close, no Escape-key close. The only way out is the
 * "Cancel" button that appears after 15s, or a stream status transition.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useInStorePaymentStream } from "@/hooks/use-instore-payment-stream";

// How long the admin has to wait before a "Cancel" escape hatch appears —
// keeps the modal non-dismissible for quick accidental taps, but doesn't
// trap the admin forever if the customer walks away.
const CANCEL_REVEAL_MS = 15_000;

interface PaymentWaitingModalProps {
  open: boolean;
  inStoreOrderId: string | null;
  method: "M-Pesa" | "Card";
  onSuccess: () => void;
  onFailure: (reason: string | undefined) => void;
  onCancelled: () => void;
}

export default function PaymentWaitingModal({
  open,
  inStoreOrderId,
  method,
  onSuccess,
  onFailure,
  onCancelled,
}: PaymentWaitingModalProps) {
  const { status, reason } = useInStorePaymentStream(open ? inStoreOrderId : null);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef(false);

  // Reset the 15s reveal timer every time the modal opens/closes.
  useEffect(() => {
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    // Reset local UI state whenever `open` flips — synchronizing with the
    // modal's own open/close lifecycle, not derived from other React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowCancel(false);
    setCancelling(false);

    if (open) {
      settledRef.current = false;
      cancelTimer.current = setTimeout(() => setShowCancel(true), CANCEL_REVEAL_MS);
    }

    return () => {
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
    };
  }, [open]);

  // Report stream status transitions upward, once each.
  useEffect(() => {
    if (!open || settledRef.current) return;
    if (status === "success") {
      settledRef.current = true;
      onSuccess();
    } else if (status === "failed" || status === "timeout") {
      settledRef.current = true;
      onFailure(reason);
    }
    // onSuccess/onFailure are expected to be stable-enough callbacks from the
    // parent panel (closures over state) — deliberately not in the deps list
    // to avoid re-firing on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, reason, open]);

  async function handleCancel() {
    if (!inStoreOrderId || cancelling) return;
    setCancelling(true);
    try {
      await fetch(`/api/admin/orders/instore/${inStoreOrderId}/cancel-wait`, { method: "POST" });
    } catch (err) {
      console.error("[PaymentWaitingModal] cancel-wait failed", err);
      // Not fatal — the admin can still close via onCancelled below and the
      // backend stream will eventually time out on its own.
    } finally {
      setCancelling(false);
      onCancelled();
    }
  }

  const waitingCopy =
    method === "M-Pesa"
      ? "Enter PIN on customer's phone"
      : "Confirming card payment…";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* No onClick here — this modal is not dismissible via backdrop click. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/45 z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            role="alertdialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[420px] bg-white dark:bg-(--dark-surface) rounded-[12px] shadow-(--e3) z-50 p-6"
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-(--green-50) dark:bg-green-900/20">
                <Loader2 size={26} className="animate-spin text-(--green-800)" />
              </div>
              <div>
                <h3 className="font-syne text-[17px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">
                  Waiting for payment confirmation…
                </h3>
                <p className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
                  {waitingCopy}
                </p>
              </div>

              {showCancel && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="h-9 px-5 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-muted) hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg) transition-colors disabled:opacity-60"
                >
                  {cancelling ? "Cancelling…" : "Cancel"}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
