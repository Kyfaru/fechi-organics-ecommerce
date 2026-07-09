"use client";

/**
 * MpesaPromptPanel — "M-Pesa Prompt" tab of the Payment step. Sends an STK
 * push to the customer's phone via POST /api/admin/orders/instore/mpesa/initiate,
 * then hands off to the shared PaymentWaitingModal/PaymentSuccessModal/
 * PaymentErrorModal system (driven by the admin SSE stream) while the
 * customer completes it on their handset.
 *
 * That route is being built by a parallel backend workstream — this panel is
 * written against the agreed JSON contract and hasn't been smoke-tested
 * against a live backend yet.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import type { Value as PhoneValue } from "react-phone-number-input";
import PhoneInput from "@/components/ui/PhoneInput";
import type { PaymentOrderContext } from "@/components/admin/orders/PaymentStep";
import PaymentWaitingModal from "@/components/admin/orders/PaymentWaitingModal";
import PaymentSuccessModal from "@/components/admin/orders/PaymentSuccessModal";
import PaymentErrorModal from "@/components/admin/orders/PaymentErrorModal";

// Cooldown after any send attempt (success or failure) so the admin can't
// double-fire STK pushes at the customer. Bumped from the earlier 8s
// placeholder to this phase's explicit 20s spec — this number supersedes it.
const SEND_COOLDOWN_MS = 20_000;

interface MpesaPromptPanelProps {
  orderContext: PaymentOrderContext;
  branchReady: boolean;
  initialPhone: PhoneValue | undefined;
}

interface InitiateResult {
  inStoreOrderId: string;
  orderNumber: string;
}

// "waiting" — PaymentWaitingModal open, subscribed to the SSE stream.
// "success" — stream reported payment_success, PaymentSuccessModal open.
// "failed"  — stream reported payment_failed/timeout, PaymentErrorModal open.
type Phase = "waiting" | "success" | "failed" | null;

export default function MpesaPromptPanel({ orderContext, branchReady, initialPhone }: MpesaPromptPanelProps) {
  const [phone, setPhone] = useState<PhoneValue | undefined>(initialPhone);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<InitiateResult | null>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [failReason, setFailReason] = useState<string | undefined>();
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(true);
    cooldownTimer.current = setTimeout(() => setCooldown(false), SEND_COOLDOWN_MS);
  }

  async function submitInitiate(retryOrderId?: string) {
    if (!phone || sending || cooldown || !branchReady) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/instore/mpesa/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerUserId: orderContext.customerUserId,
          customerName: orderContext.customerName,
          customerPhone: phone as string,
          customerEmail: orderContext.customerEmail,
          items: orderContext.items,
          promoCode: orderContext.promoCode,
          branchId: orderContext.branchId,
          ...(retryOrderId ? { retryOrderId } : {}),
        }),
      });
      const json = await res.json() as {
        ok: boolean;
        data?: InitiateResult;
        error?: { message: string };
      };
      if (!json.ok || !json.data) {
        setError(json.error?.message ?? "Could not send the M-Pesa prompt — please try again");
        return;
      }
      setPending(json.data);
      setFailReason(undefined);
      setPhase("waiting");
    } catch (err) {
      console.error("[MpesaPromptPanel] initiate failed", err);
      setError("Failed to send the M-Pesa prompt — please try again");
    } finally {
      setSending(false);
      startCooldown();
    }
  }

  function handleSendPrompt() {
    submitInitiate();
  }

  function handleWaitingSuccess() {
    setPhase("success");
  }

  function handleWaitingFailure(reason: string | undefined) {
    setFailReason(reason);
    setPhase("failed");
  }

  function handleWaitingCancelled() {
    setPhase(null);
    setPending(null);
  }

  function handleSuccessClose() {
    setPhase(null);
    setPending(null);
  }

  function handleTryAgain() {
    const retryOrderId = pending?.inStoreOrderId;
    submitInitiate(retryOrderId);
  }

  const hasEmail = orderContext.customerEmail.trim().length > 0;
  const hasPhone = orderContext.customerPhone.trim().length > 0;

  const disabled = !branchReady || !phone || sending || cooldown;

  return (
    <div className="flex flex-col gap-4">
      {!branchReady && (
        <p className="font-dm text-[12px] text-(--danger)">Select a branch above before collecting payment.</p>
      )}

      <div className="max-w-sm">
        <PhoneInput label="Phone Number" value={phone} onChange={setPhone} id="mpesa-prompt-phone" />
      </div>

      <div>
        <button
          type="button"
          onClick={handleSendPrompt}
          disabled={disabled}
          className="h-10 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {sending ? "Sending…" : "Send M-Pesa Prompt"}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 font-dm text-[12px] text-(--danger)">
          <AlertCircle size={13} className="shrink-0" /> {error}
        </p>
      )}

      <PaymentWaitingModal
        open={phase === "waiting"}
        inStoreOrderId={pending?.inStoreOrderId ?? null}
        method="M-Pesa"
        onSuccess={handleWaitingSuccess}
        onFailure={handleWaitingFailure}
        onCancelled={handleWaitingCancelled}
      />

      {pending && (
        <PaymentSuccessModal
          open={phase === "success"}
          inStoreOrderId={pending.inStoreOrderId}
          orderNumber={pending.orderNumber}
          totalKes={orderContext.totalKes}
          hasEmail={hasEmail}
          hasPhone={hasPhone}
          onClose={handleSuccessClose}
        />
      )}

      <PaymentErrorModal
        open={phase === "failed"}
        reason={failReason}
        onTryAgain={handleTryAgain}
        onClose={() => setPhase(null)}
      />
    </div>
  );
}
