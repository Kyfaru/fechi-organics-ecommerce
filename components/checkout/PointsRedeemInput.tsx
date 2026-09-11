"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

/**
 * Spend Fechi points at checkout. Mirrors the coupon input's shape and sits
 * directly beneath it, because points always apply AFTER the coupon.
 *
 * `grossCents` is the bill after any coupon. Every figure shown here comes
 * from /api/points/quote, which runs the same applyPoints() the payment routes
 * use — so the amount on screen and the amount charged cannot drift.
 */

type Quote = {
  available: number;
  locked: number;
  centsPerPoint: number;
  maxRedeemablePoints: number;
  maxDiscountCents: number;
};

type ApplyResult = {
  valid?: boolean;
  pointsRedeemed?: number;
  discountCents?: number;
  message?: string;
  error?: string;
} & Quote;

function kes(cents: number) {
  return `KSh ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export default function PointsRedeemInput({
  grossCents,
  appliedPoints,
  onApply,
  onRemove,
  disabled = false,
}: {
  grossCents: number;
  appliedPoints: number;
  onApply: (points: number, discountCents: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  // Balance only — the applied amount is re-derived on the server at pay time.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/points/quote?gross=${grossCents}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        setQuote(json.data as Quote);
      })
      .catch(() => {
        /* signed out or offline — the section simply doesn't render */
      });
    return () => {
      cancelled = true;
    };
  }, [grossCents]);

  if (!quote || (quote.available === 0 && quote.locked === 0)) return null;

  async function apply() {
    const points = parseInt(input, 10);
    if (!Number.isFinite(points) || points <= 0) {
      setStatus("error");
      setMessage("Enter how many points you'd like to use");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch(`/api/points/quote?gross=${grossCents}&points=${points}`);
      const json = await res.json();
      if (!json.ok) {
        setStatus("error");
        setMessage(json.error?.message ?? "Could not apply your points");
        return;
      }
      const data = json.data as ApplyResult;
      if (!data.valid) {
        setStatus("error");
        setMessage(data.error ?? "Could not apply your points");
        return;
      }
      setStatus("idle");
      setMessage(data.message ?? "");
      onApply(data.pointsRedeemed ?? 0, data.discountCents ?? 0);
    } catch {
      setStatus("error");
      setMessage("Could not reach the server — please try again");
    }
  }

  function remove() {
    setInput("");
    setStatus("idle");
    setMessage("");
    onRemove();
  }

  return (
    <div className="rounded-xl border border-[#DCFCE7] bg-[#F0FDF4] p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Icon icon="lucide:trophy" width={15} className="text-[#15803D]" />
          <span className="text-[13px] font-bold text-[#15803D]">Fechi Points</span>
        </div>
        <span className="text-[12px] text-[#15803D]">
          {quote.available.toLocaleString()} available
        </span>
      </div>

      {quote.locked > 0 && quote.available === 0 ? (
        <p className="text-[12px] text-neutral-500">
          Your {quote.locked.toLocaleString()} welcome points unlock once this first order is paid.
        </p>
      ) : appliedPoints > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-[#15803D]">
            <strong>{appliedPoints.toLocaleString()} points</strong> applied
          </p>
          <button
            type="button"
            onClick={remove}
            disabled={disabled}
            className="text-[12px] font-medium text-neutral-500 underline hover:text-neutral-700 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={quote.maxRedeemablePoints}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setStatus("idle");
                setMessage("");
              }}
              placeholder={`Up to ${quote.maxRedeemablePoints.toLocaleString()}`}
              disabled={disabled}
              className="h-10 flex-1 rounded-lg border border-[#DCFCE7] bg-white px-3 text-[14px] outline-none focus:border-[#15803D] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={apply}
              disabled={disabled || status === "loading"}
              className="h-10 shrink-0 rounded-lg bg-[#15803D] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#166534] disabled:opacity-50"
            >
              {status === "loading" ? "…" : "Apply"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setInput(String(quote.maxRedeemablePoints))}
            disabled={disabled}
            className="mt-1.5 text-[12px] text-[#15803D] underline disabled:opacity-50"
          >
            Use max ({kes(quote.maxDiscountCents)} off)
          </button>
        </>
      )}

      {message && (
        <p
          className={`mt-1.5 text-[12px] ${status === "error" ? "text-red-600" : "text-[#15803D]"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
