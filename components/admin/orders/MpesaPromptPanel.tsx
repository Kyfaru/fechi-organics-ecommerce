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
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Send } from "lucide-react";
import type { Value as PhoneValue } from "react-phone-number-input";
import PhoneInput from "@/components/ui/PhoneInput";
import type { PaymentOrderContext } from "@/components/admin/orders/PaymentStep";
import PaymentWaitingModal from "@/components/admin/orders/PaymentWaitingModal";
import PaymentSuccessModal from "@/components/admin/orders/PaymentSuccessModal";
import PaymentErrorModal from "@/components/admin/orders/PaymentErrorModal";
import { toast } from "@/lib/toast";

// A prompt was either confirmed sent, or left in an ambiguous state (the
// admin cancelled while waiting, or the request errored after it may already
// have reached the server) — in every one of those cases a second STK push
// for the same sale is a real risk, not just a UX nicety. 30s comfortably
// covers the hard requirement (never re-fire within 15s) while giving the
// first prompt time to actually land on the customer's phone.
const RESEND_COOLDOWN_MS = 30_000;

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
  const router = useRouter();
  const [phone, setPhone] = useState<PhoneValue | undefined>(initialPhone);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<InitiateResult | null>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [failReason, setFailReason] = useState<string | undefined>();

  // Ref (not just state) so the guard in submitInitiate reads the real
  // deadline synchronously, even across two clicks that land before a
  // re-render — the countdown state below is for display only.
  const cooldownEndsAtRef = useRef<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  function beginResendCooldown() {
    cooldownEndsAtRef.current = Date.now() + RESEND_COOLDOWN_MS;
    setCooldownSeconds(Math.ceil(RESEND_COOLDOWN_MS / 1000));
    if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    cooldownIntervalRef.current = setInterval(() => {
      const msLeft = (cooldownEndsAtRef.current ?? 0) - Date.now();
      if (msLeft <= 0) {
        cooldownEndsAtRef.current = null;
        setCooldownSeconds(0);
        if (cooldownIntervalRef.current) {
          clearInterval(cooldownIntervalRef.current);
          cooldownIntervalRef.current = null;
        }
        return;
      }
      setCooldownSeconds(Math.ceil(msLeft / 1000));
    }, 1000);
  }

  async function submitInitiate(retryOrderId?: string) {
    if (cooldownEndsAtRef.current && Date.now() < cooldownEndsAtRef.current) {
      toast.warning("Please wait before retrying", {
        message: `A similar transaction is already in progress — try again in ${cooldownSeconds}s.`,
      });
      return;
    }
    if (!phone || sending || !branchReady) return;

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
          customerEmail: orderContext.customerEmail.trim() || undefined,
          items: orderContext.items,
          promoCode: orderContext.promoCode,
          branchId: orderContext.branchId,
          deliveryZoneId: orderContext.deliveryZoneId,
          ...(retryOrderId ? { retryOrderId } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const json = await res.json() as {
        ok: boolean;
        data?: InitiateResult;
        error?: { message: string };
      };
      if (!json.ok || !json.data) {
        // A clean rejection (validation, rate limit, STK_FAILED) — no prompt
        // was ever dispatched, so an immediate retry via "Try Again" is safe
        // and shouldn't be blocked by the resend cooldown.
        setError(json.error?.message ?? "Could not send the M-Pesa prompt — please try again");
        return;
      }
      setPending(json.data);
      setFailReason(undefined);
      setPhase("waiting");
      beginResendCooldown();
    } catch (err) {
      // Unlike the branch above, we never learned how this request ended —
      // the server may well have dispatched a prompt before the connection
      // dropped. Treat it like a successful send for cooldown purposes.
      console.error("[MpesaPromptPanel] initiate failed", err);
      setError("Failed to send the M-Pesa prompt — please try again");
      beginResendCooldown();
    } finally {
      setSending(false);
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
    // The order's transaction may still resolve server-side (or the customer
    // may still be looking at the prompt on their phone) — cooldown before
    // letting the admin fire another one.
    beginResendCooldown();
  }

  function handleSuccessClose() {
    setPhase(null);
    setPending(null);
    router.push("/admin/orders");
  }

  function handleTryAgain() {
    const retryOrderId = pending?.inStoreOrderId;
    submitInitiate(retryOrderId);
  }

  const hasEmail = orderContext.customerEmail.trim().length > 0;
  const hasPhone = orderContext.customerPhone.trim().length > 0;

  const disabled = !branchReady || !phone || sending;

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

        {cooldownSeconds > 0 && (
          <p className="mt-1.5 font-dm text-[12px] text-(--neutral-500)">
            You can send another prompt in {cooldownSeconds}s
          </p>
        )}
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
