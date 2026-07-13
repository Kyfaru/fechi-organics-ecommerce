"use client";

/**
 * MpesaLivePanel — "M-Pesa Live" tab of the Payment step. Starts a C2B
 * listening window via POST /api/admin/orders/instore/mpesa/c2b/start, then
 * polls GET /api/admin/orders/instore/mpesa/c2b/matches for up to 20s looking
 * for a transaction that matches the order total. The admin picks the
 * matching row (there can be more than one payer sending the same amount in
 * the window) which claims it via POST .../c2b/claim.
 *
 * Those routes are being built by a parallel backend workstream — this panel
 * is written against the agreed JSON contract and hasn't been smoke-tested
 * against a live backend yet.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Radio, RotateCcw, X } from "lucide-react";
import type { PaymentOrderContext } from "@/components/admin/orders/PaymentStep";
import PaymentSuccessModal from "@/components/admin/orders/PaymentSuccessModal";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 20_000;

interface MpesaLivePanelProps {
  orderContext: PaymentOrderContext;
  branchReady: boolean;
}

interface C2bMatch {
  id: string;
  transId: string;
  transAmount: number;
  payerName: string;
  transactionTime: string;
}

type ListenState = "idle" | "listening" | "matched" | "timeout";

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

export default function MpesaLivePanel({ orderContext, branchReady }: MpesaLivePanelProps) {
  const router = useRouter();
  const [state, setState] = useState<ListenState>("idle");
  const [matches, setMatches] = useState<C2bMatch[]>([]);
  const [startError, setStartError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<{ inStoreOrderId: string; orderNumber: string } | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current);
    pollTimer.current = null;
    timeoutTimer.current = null;
  }

  useEffect(() => clearTimers, []);

  async function pollMatches() {
    try {
      const params = new URLSearchParams({
        branchId: orderContext.branchId ?? "",
        amount: String(orderContext.totalKes),
      });
      const res = await fetch(`/api/admin/orders/instore/mpesa/c2b/matches?${params.toString()}`);
      const json = await res.json() as { ok: boolean; data?: { matches: C2bMatch[] } };
      if (json.ok && json.data && json.data.matches.length > 0) {
        clearTimers();
        setMatches(json.data.matches);
        setState("matched");
      }
    } catch (err) {
      console.error("[MpesaLivePanel] poll failed", err);
      // Swallow individual poll failures — keep trying until the overall timeout.
    }
  }

  async function handleStartListening() {
    if (!branchReady) return;
    setStartError(null);
    setClaimError(null);
    setClaimed(null);
    setMatches([]);

    try {
      const res = await fetch("/api/admin/orders/instore/mpesa/c2b/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: orderContext.branchId, amountKes: orderContext.totalKes }),
      });
      const json = await res.json() as { ok: boolean; data?: { windowSeconds: number }; error?: { message: string } };
      if (!json.ok) {
        setStartError(json.error?.message ?? "Could not start listening for M-Pesa transactions");
        return;
      }

      setState("listening");
      clearTimers();
      pollTimer.current = setInterval(pollMatches, POLL_INTERVAL_MS);
      timeoutTimer.current = setTimeout(() => {
        clearTimers();
        setState((current) => (current === "listening" ? "timeout" : current));
      }, POLL_TIMEOUT_MS);
    } catch (err) {
      console.error("[MpesaLivePanel] start failed", err);
      setStartError("Could not start listening for M-Pesa transactions");
    }
  }

  function handleCancel() {
    clearTimers();
    setState("idle");
    setMatches([]);
  }

  async function handleSelectMatch(match: C2bMatch) {
    setClaimingId(match.id);
    setClaimError(null);
    try {
      const res = await fetch("/api/admin/orders/instore/mpesa/c2b/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          c2bTransactionId: match.id,
          customerUserId: orderContext.customerUserId,
          customerName: orderContext.customerName,
          customerPhone: orderContext.customerPhone,
          customerEmail: orderContext.customerEmail.trim() || undefined,
          items: orderContext.items,
          promoCode: orderContext.promoCode,
          branchId: orderContext.branchId,
        }),
      });
      const json = await res.json() as {
        ok: boolean;
        data?: { inStoreOrderId: string; orderNumber: string };
        error?: { message: string };
      };
      if (!json.ok || !json.data) {
        setClaimError(json.error?.message ?? "Could not match this transaction to the order — please retry");
        return;
      }
      setClaimed({ inStoreOrderId: json.data.inStoreOrderId, orderNumber: json.data.orderNumber });
    } catch (err) {
      console.error("[MpesaLivePanel] claim failed", err);
      setClaimError("Could not match this transaction to the order — please retry");
    } finally {
      setClaimingId(null);
    }
  }

  // Already paid and claimed — C2B claims are synchronous (the payment
  // already happened before the claim call), so no PaymentWaitingModal is
  // needed here, unlike the M-Pesa Prompt/Card flows. Go straight to the
  // shared success modal.
  if (claimed) {
    const hasEmail = orderContext.customerEmail.trim().length > 0;
    const hasPhone = orderContext.customerPhone.trim().length > 0;
    return (
      <PaymentSuccessModal
        open
        inStoreOrderId={claimed.inStoreOrderId}
        orderNumber={claimed.orderNumber}
        totalKes={orderContext.totalKes}
        hasEmail={hasEmail}
        hasPhone={hasPhone}
        onClose={() => {
          setClaimed(null);
          router.push("/admin/orders");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!branchReady && (
        <p className="font-dm text-[12px] text-(--danger)">Select a branch above before collecting payment.</p>
      )}

      <div className="flex items-center justify-between rounded-[8px] bg-(--neutral-50) dark:bg-(--dark-bg) px-3 py-2.5">
        <span className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted)">Listening for</span>
        <span className="font-syne text-[15px] font-bold text-(--green-800)">{formatKes(orderContext.totalKes)}</span>
      </div>

      {state === "idle" && (
        <div>
          <button
            type="button"
            onClick={handleStartListening}
            disabled={!branchReady}
            className="h-10 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Radio size={14} />
            Start Listening
          </button>
        </div>
      )}

      {state === "listening" && (
        <div className="rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) p-3 flex items-center gap-2.5">
          <Loader2 size={15} className="animate-spin text-(--green-800) shrink-0" />
          <p className="font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text)">
            Listening for a matching M-Pesa payment…
          </p>
        </div>
      )}

      {state === "matched" && (
        <div className="flex flex-col gap-2">
          <p className="font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px]">
            Matching transactions
          </p>
          <div className="max-h-[260px] overflow-y-auto flex flex-col gap-2 pr-0.5">
            {matches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between gap-3 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) p-3"
              >
                <div className="min-w-0">
                  <p className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">
                    {match.payerName}
                  </p>
                  <p className="font-dm text-[11px] text-(--neutral-400)">
                    {formatKes(match.transAmount)} · {match.transId} ·{" "}
                    {new Date(match.transactionTime).toLocaleTimeString("en-KE")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectMatch(match)}
                  disabled={claimingId !== null}
                  className="h-8 px-3 rounded-[6px] bg-(--green-800) font-dm text-[12px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
                >
                  {claimingId === match.id && <Loader2 size={12} className="animate-spin" />}
                  Select
                </button>
              </div>
            ))}
          </div>
          {claimError && (
            <p className="flex items-center gap-1.5 font-dm text-[12px] text-(--danger)">
              <AlertCircle size={13} className="shrink-0" /> {claimError}
            </p>
          )}
        </div>
      )}

      {state === "timeout" && (
        <div className="flex flex-col gap-3">
          <p className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
            No matching M-Pesa payment was found in the listening window.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="h-9 px-4 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-muted) hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg) transition-colors flex items-center gap-1.5"
            >
              <X size={13} /> Cancel
            </button>
            <button
              type="button"
              onClick={handleStartListening}
              className="h-9 px-4 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <RotateCcw size={13} /> Try Again
            </button>
          </div>
        </div>
      )}

      {startError && (
        <p className="flex items-center gap-1.5 font-dm text-[12px] text-(--danger)">
          <AlertCircle size={13} className="shrink-0" /> {startError}
        </p>
      )}
    </div>
  );
}
