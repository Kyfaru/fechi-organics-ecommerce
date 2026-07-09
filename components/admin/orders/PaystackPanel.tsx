"use client";

/**
 * PaystackPanel — "Card" tab of the Payment step. Initializes a Paystack
 * transaction server-side via POST /api/admin/orders/instore/paystack/initialize,
 * then resumes it in Paystack's Inline.js v2 popup using the returned access
 * code. Paystack's webhook is the source of truth for whether the charge
 * actually succeeded — `onSuccess` here only means the customer submitted
 * their card details, not that the payment is confirmed, so we hand off to
 * the shared PaymentWaitingModal (driven by the admin SSE stream) rather than
 * treating the popup's onSuccess as final.
 *
 * That route is being built by a parallel backend workstream — this panel is
 * written against the agreed JSON contract and hasn't been smoke-tested
 * against a live backend yet.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";
import type { PaymentOrderContext } from "@/components/admin/orders/PaymentStep";
import PaymentWaitingModal from "@/components/admin/orders/PaymentWaitingModal";
import PaymentSuccessModal from "@/components/admin/orders/PaymentSuccessModal";
import PaymentErrorModal from "@/components/admin/orders/PaymentErrorModal";

const PAYSTACK_SCRIPT_SRC = "https://js.paystack.co/v2/inline.js";

// Paystack's Inline.js v2 has no official npm types package — declare just
// the surface this panel uses. Checked the repo for an existing declaration
// before adding this (grep for PaystackPop turned up nothing).
declare global {
  interface Window {
    PaystackPop?: new () => {
      resumeTransaction: (
        accessCode: string,
        handlers: { onSuccess: () => void; onCancel: () => void }
      ) => void;
    };
  }
}

// Module-scoped (not component-scoped) so the script is only ever injected
// once per page, even if this panel unmounts/remounts (e.g. switching tabs
// and back) across the wizard's lifetime.
let paystackScriptPromise: Promise<void> | null = null;
function loadPaystackScript(): Promise<void> {
  if (typeof window !== "undefined" && window.PaystackPop) return Promise.resolve();
  if (paystackScriptPromise) return paystackScriptPromise;
  paystackScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PAYSTACK_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      paystackScriptPromise = null; // allow retry on next attempt
      reject(new Error("Failed to load Paystack checkout script"));
    };
    document.head.appendChild(script);
  });
  return paystackScriptPromise;
}

interface PaystackPanelProps {
  orderContext: PaymentOrderContext;
  branchReady: boolean;
}

interface InitializeResult {
  inStoreOrderId: string;
  orderNumber: string;
  accessCode: string;
  publicKey: string;
}

// Cooldown after any charge attempt (submitted, cancelled, or failed) so the
// admin can't double-fire card charges — matches MpesaPromptPanel's 20s spec
// for consistency across payment methods.
const CHARGE_COOLDOWN_MS = 20_000;

// "waiting" — customer submitted card details, PaymentWaitingModal open
// awaiting the Paystack webhook via SSE.
// "success" — stream reported payment_success, PaymentSuccessModal open.
// "failed"  — stream reported payment_failed/timeout, PaymentErrorModal open.
type Phase = "waiting" | "success" | "failed" | null;

export default function PaystackPanel({ orderContext, branchReady }: PaystackPanelProps) {
  const [charging, setCharging] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<InitializeResult | null>(null);
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
    cooldownTimer.current = setTimeout(() => setCooldown(false), CHARGE_COOLDOWN_MS);
  }

  async function submitCharge(retryOrderId?: string) {
    if (!branchReady || charging || cooldown) return;

    setCharging(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/instore/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerUserId: orderContext.customerUserId,
          customerName: orderContext.customerName,
          customerEmail: orderContext.customerEmail,
          items: orderContext.items,
          promoCode: orderContext.promoCode,
          branchId: orderContext.branchId,
          ...(retryOrderId ? { retryOrderId } : {}),
        }),
      });
      const json = await res.json() as { ok: boolean; data?: InitializeResult; error?: { message: string } };
      if (!json.ok || !json.data) {
        setError(json.error?.message ?? "Could not start the card charge — please try again");
        setCharging(false);
        startCooldown();
        return;
      }
      setOrder(json.data);

      await loadPaystackScript();
      if (!window.PaystackPop) {
        setError("Card checkout is unavailable right now — please try again");
        setCharging(false);
        startCooldown();
        return;
      }

      const popup = new window.PaystackPop();
      popup.resumeTransaction(json.data.accessCode, {
        onSuccess: () => {
          // Customer submitted card details — NOT proof of payment. Final
          // confirmation arrives async via the Paystack webhook, reported
          // through the shared SSE-driven waiting modal.
          setFailReason(undefined);
          setPhase("waiting");
          setCharging(false);
          startCooldown();
        },
        onCancel: () => {
          setCharging(false);
          startCooldown();
        },
      });
    } catch (err) {
      console.error("[PaystackPanel] charge failed", err);
      setError("Could not start the card charge — please try again");
      setCharging(false);
      startCooldown();
    }
  }

  function handleChargeCard() {
    submitCharge();
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
    setOrder(null);
  }

  function handleSuccessClose() {
    setPhase(null);
    setOrder(null);
  }

  function handleTryAgain() {
    const retryOrderId = order?.inStoreOrderId;
    submitCharge(retryOrderId);
  }

  const hasEmail = orderContext.customerEmail.trim().length > 0;
  const hasPhone = orderContext.customerPhone.trim().length > 0;

  const disabled = !branchReady || charging || cooldown;

  return (
    <div className="flex flex-col gap-4">
      {!branchReady && (
        <p className="font-dm text-[12px] text-(--danger)">Select a branch above before collecting payment.</p>
      )}

      <div>
        <button
          type="button"
          onClick={handleChargeCard}
          disabled={disabled}
          className="h-10 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {charging ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
          {charging ? "Opening card checkout…" : "Charge Card"}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 font-dm text-[12px] text-(--danger)">
          <AlertCircle size={13} className="shrink-0" /> {error}
        </p>
      )}

      <PaymentWaitingModal
        open={phase === "waiting"}
        inStoreOrderId={order?.inStoreOrderId ?? null}
        method="Card"
        onSuccess={handleWaitingSuccess}
        onFailure={handleWaitingFailure}
        onCancelled={handleWaitingCancelled}
      />

      {order && (
        <PaymentSuccessModal
          open={phase === "success"}
          inStoreOrderId={order.inStoreOrderId}
          orderNumber={order.orderNumber}
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
