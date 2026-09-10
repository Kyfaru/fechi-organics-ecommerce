"use client";

/**
 * PaymentSuccessModal — shared "payment confirmed" modal used by all three
 * in-store payment panels once a payment is confirmed (M-Pesa Prompt via
 * PaymentWaitingModal's onSuccess, Card via the same, M-Pesa Live directly
 * after a successful claim). Lets the admin pick an invoice channel and send
 * a receipt, or skip and close.
 *
 * Dismissible like ConfirmModal (backdrop click / "×" / "Skip" all close).
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, X } from "lucide-react";

type Channel = "email" | "sms";

interface PaymentSuccessModalProps {
  open: boolean;
  inStoreOrderId: string;
  orderNumber: string;
  totalKes: number;
  hasEmail: boolean;
  hasPhone: boolean;
  onClose: () => void;
}

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

// Fire-and-forget receipt send used by the "×" and "Skip" exits — the admin
// is closing regardless of whether this succeeds, so we don't block on it or
// surface a loading/error state for this path.
function sendReceiptFireAndForget(inStoreOrderId: string, channel: "email" | "sms" | "both") {
  fetch(`/api/admin/orders/instore/${inStoreOrderId}/send-receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  }).catch((err) => {
    console.error("[PaymentSuccessModal] fire-and-forget send-receipt failed", err);
  });
}

export default function PaymentSuccessModal({
  open,
  inStoreOrderId,
  orderNumber,
  totalKes,
  hasEmail,
  hasPhone,
  onClose,
}: PaymentSuccessModalProps) {
  const [channel, setChannel] = useState<Channel | null>(hasEmail ? "email" : hasPhone ? "sms" : null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Reset local state whenever the modal is (re)opened for a new order.
  useEffect(() => {
    if (open) {
      // Resetting local UI state on the modal's own open transition, not
      // derived from other React state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChannel(hasEmail ? "email" : hasPhone ? "sms" : null);
      setSending(false);
      setSent(false);
      setSendError(null);
    }
    // Only re-derive default channel on open — not on every hasEmail/hasPhone
    // reference change, which would clobber the admin's manual selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSkipOrClose() {
    sendReceiptFireAndForget(inStoreOrderId, "both");
    onClose();
  }

  async function handleSend() {
    if (!channel || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/orders/instore/${inStoreOrderId}/send-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { sent: string[]; smsScheduled?: boolean };
        error?: { message: string };
      };
      if (!json.ok) {
        setSendError(json.error?.message ?? "Could not send the receipt — please try again");
        setSending(false);
        return;
      }
      setSent(true);
      setSending(false);
      // Brief confirmation flash before auto-closing.
      setTimeout(onClose, 800);
    } catch (err) {
      console.error("[PaymentSuccessModal] send-receipt failed", err);
      setSendError("Could not send the receipt — please try again");
      setSending(false);
    }
  }

  const noChannelAvailable = !hasEmail && !hasPhone;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/45 z-50"
            onClick={handleSkipOrClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[440px] bg-white dark:bg-(--dark-surface) rounded-[12px] shadow-(--e3) z-50 p-6"
          >
            <button
              type="button"
              onClick={handleSkipOrClose}
              aria-label="Close"
              className="absolute top-4 right-4 text-(--neutral-400) hover:text-(--neutral-700) dark:hover:text-(--dark-text) transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-(--green-50) dark:bg-green-900/20">
                <CheckCircle2 size={20} className="text-(--green-800)" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">
                  Payment confirmed
                </h3>
                <p className="font-dm text-[14px] text-(--neutral-500) dark:text-(--dark-muted)">
                  Order #{orderNumber} — {formatKes(totalKes)}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">
                Send receipt via
              </p>

              {noChannelAvailable ? (
                <p className="font-dm text-[13px] text-(--neutral-400)">
                  No email or phone on file for this customer.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <label
                    className={`flex items-center gap-2 ${hasEmail ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}
                  >
                    <input
                      type="radio"
                      name="receiptChannel"
                      checked={channel === "email"}
                      disabled={!hasEmail}
                      onChange={() => setChannel("email")}
                      className="accent-(--green-800)"
                    />
                    <span className="font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-text)">Email</span>
                  </label>
                  <label
                    className={`flex items-center gap-2 ${hasPhone ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}
                  >
                    <input
                      type="radio"
                      name="receiptChannel"
                      checked={channel === "sms"}
                      disabled={!hasPhone}
                      onChange={() => setChannel("sms")}
                      className="accent-(--green-800)"
                    />
                    <span className="font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-text)">SMS</span>
                  </label>
                </div>
              )}

              {sendError && (
                <p className="font-dm text-[12px] text-(--danger) mt-2">{sendError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={handleSkipOrClose}
                className="h-10 px-5 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-muted) hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg) transition-colors"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!channel || sending || noChannelAvailable}
                className="h-10 px-5 rounded-[8px] bg-(--green-800) font-dm text-[14px] font-medium text-white hover:bg-(--green-900) transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : sent ? <CheckCircle2 size={14} /> : null}
                {sent ? "Sent" : sending ? "Sending…" : "Send"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
