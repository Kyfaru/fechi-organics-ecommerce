"use client";

/**
 * PaymentErrorModal — shared "payment failed" modal used by the M-Pesa
 * Prompt and Card panels when the SSE stream reports `failed`/`timeout`.
 * Thin wrapper around the codebase's existing ConfirmModal chrome (dismissible
 * via backdrop/close, matching the rest of the admin panel) rather than
 * rebuilding modal visuals from scratch.
 */

import { ConfirmModal } from "@/components/ui/ConfirmModal";

interface PaymentErrorModalProps {
  open: boolean;
  reason: string | undefined;
  onTryAgain: () => void;
  onClose: () => void;
}

export default function PaymentErrorModal({ open, reason, onTryAgain, onClose }: PaymentErrorModalProps) {
  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      onConfirm={() => {
        onTryAgain();
        onClose();
      }}
      title="Payment failed"
      description={reason ?? "Payment could not be completed"}
      confirmLabel="Try Again"
      danger
    />
  );
}
