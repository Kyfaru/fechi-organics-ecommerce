"use client";

import { useEffect, useRef } from "react";

interface OtpPinInputProps {
  length?: number;
  disabled?: boolean;
  /** Bump this (any changing number) to force-clear all boxes — e.g. after a wrong code or a resend. */
  resetSignal?: number;
  /** Called with the joined code the instant all boxes are filled. */
  onComplete: (code: string) => void;
  /** Controls focus-ring color to match the surrounding page (green customer pages, gold admin pages). */
  theme?: "customer" | "admin";
}

const THEME_CLASSES = {
  customer: "focus:border-[#27731e] focus:ring-2 focus:ring-[#27731e]/20",
  admin: "focus:border-[#DEAE00] focus:ring-2 focus:ring-[#DEAE00]/20",
} as const;

/**
 * 6-digit OTP entry built on Preline's PIN Input plugin
 * (data-hs-pin-input / data-hs-pin-input-item — see node_modules/preline/dist/pin-input.js
 * for the exact markup contract, since no page in this repo used it before).
 *
 * Why: gives per-digit auto-advance, backspace-to-previous-box, and
 * paste-fills-all-boxes behavior for free instead of hand-rolling it again
 * (components/auth/OTPModal.tsx already hand-rolls this for the sign-in OTP
 * modal — this component intentionally does not duplicate that logic).
 *
 * We instantiate `new HSPinInput(el)` explicitly rather than relying on the
 * plugin's own window-load autoInit(), since this component mounts well
 * after initial page load (a later wizard step) — autoInit() only scans the
 * DOM once, at 'load', and would never see a container added later.
 * (preline/plugins/pin-input-non-auto ships with no .d.ts, so we import the
 * regular plugin subpath — its own autoInit listener is harmless here since
 * it never finds this element at page-load time.)
 */
export default function OtpPinInput({
  length = 6,
  disabled = false,
  resetSignal = 0,
  onComplete,
  theme = "customer",
}: OtpPinInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<{ destroy: () => void } | null>(null);
  // Ref so the Preline event listener (attached once, below) always calls the
  // latest onComplete without needing to re-attach on every parent re-render.
  // Updated in an effect, never during render — mutating a ref during render
  // is unsafe (react-hooks/refs).
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    import("preline/plugins/pin-input").then(({ default: HSPinInput }) => {
      if (cancelled || !containerRef.current) return;
      instanceRef.current = new HSPinInput(containerRef.current) as unknown as { destroy: () => void };
    });
    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function handleCompleted(e: Event) {
      const detail = (e as CustomEvent).detail?.payload as { currentValue: string[] } | undefined;
      if (detail) onCompleteRef.current(detail.currentValue.join(""));
    }
    el.addEventListener("completed.hs.pinInput", handleCompleted);
    return () => el.removeEventListener("completed.hs.pinInput", handleCompleted);
  }, []);

  // Parent bumps resetSignal after a wrong code or a resend — clear every box.
  useEffect(() => {
    if (resetSignal === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLInputElement>("[data-hs-pin-input-item]");
    items.forEach((item) => {
      item.value = "";
    });
    el.classList.remove("active");
    items[0]?.focus();
  }, [resetSignal]);

  return (
    <div ref={containerRef} data-hs-pin-input="" className="flex justify-center gap-2.5">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          type="text"
          inputMode="numeric"
          maxLength={1}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          data-hs-pin-input-item=""
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={[
            "w-[46px] h-[56px] text-center text-xl font-bold rounded-xl border-2 outline-none",
            "transition-all duration-150 text-[#1a1c1c] dark:text-white bg-white dark:bg-gray-800",
            "border-[#c0cab8] dark:border-gray-600",
            THEME_CLASSES[theme],
            disabled ? "opacity-50 cursor-not-allowed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
    </div>
  );
}
