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

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";
import type { PaymentOrderContext } from "@/components/admin/orders/PaymentStep";
import PaymentWaitingModal from "@/components/admin/orders/PaymentWaitingModal";
import PaymentSuccessModal from "@/components/admin/orders/PaymentSuccessModal";
import PaymentErrorModal from "@/components/admin/orders/PaymentErrorModal";
import { useSubmitCooldown } from "@/hooks/use-submit-cooldown";

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

// "waiting" — customer submitted card details, PaymentWaitingModal open
// awaiting the Paystack webhook via SSE.
// "success" — stream reported payment_success, PaymentSuccessModal open.
// "failed"  — stream reported payment_failed/timeout, PaymentErrorModal open.
type Phase = "waiting" | "success" | "failed" | null;

export default function PaystackPanel({ orderContext, branchReady }: PaystackPanelProps) {
  const router = useRouter();
  const [charging, setCharging] = useState(false);
  const { cooldown, startCooldown } = useSubmitCooldown();
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<InitializeResult | null>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [failReason, setFailReason] = useState<string | undefined>();

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
          customerEmail: orderContext.customerEmail.trim() || undefined,
          items: orderContext.items,
          promoCode: orderContext.promoCode,
          branchId: orderContext.branchId,
          deliveryZoneId: orderContext.deliveryZoneId,
          ...(retryOrderId ? { retryOrderId } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const json = await res.json() as { ok: boolean; data?: InitializeResult; error?: { message: string } };
      if (!json.ok || !json.data) {
        setError(json.error?.message ?? "Could not start the card charge — please try again");
        setCharging(false);
        startCooldown("error");
        return;
      }
      setOrder(json.data);

      await loadPaystackScript();
      if (!window.PaystackPop) {
        setError("Card checkout is unavailable right now — please try again");
        setCharging(false);
        startCooldown("error");
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
          startCooldown("success");
        },
        onCancel: () => {
          // Customer closed the popup before submitting card details — no
          // webhook will ever arrive for this attempt, so the PENDING
          // transaction/order rows created by initialize() above would
          // otherwise sit stuck until the 10-minute SSE timeout. Same call
          // PaymentWaitingModal's own Cancel button makes; best-effort only,
          // matching its error handling (not fatal to the admin's flow).
          // Treated as "success" cooldown (flat 5s), not "error" — nothing
          // actually failed server-side, the admin just backed out.
          const orderId = json.data?.inStoreOrderId;
          if (orderId) {
            fetch(`/api/admin/orders/instore/${orderId}/cancel-wait`, { method: "POST" }).catch((err) => {
              console.error("[PaystackPanel] cancel-wait failed", err);
            });
          }
          setCharging(false);
          startCooldown("success");
        },
      });
    } catch (err) {
      console.error("[PaystackPanel] charge failed", err);
      setError("Could not start the card charge — please try again");
      setCharging(false);
      startCooldown("error");
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
    router.push("/admin/orders");
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
