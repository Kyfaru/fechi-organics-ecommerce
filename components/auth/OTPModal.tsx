"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OTPModalProps {
  isOpen: boolean;
  email: string;
  onClose: () => void;
  /** Called once OTP is verified and the user is fully signed in. */
  onVerified: () => void;
  /** Called when the user hits the resend rate limit — parent should show an error. */
  onMaxAttemptsReached: () => void;
  /** Called to send/resend the OTP email. */
  onRequestOTP: () => Promise<void>;
  /** Called with the entered OTP string; returns success or an error message. */
  onVerifyOTP: (otp: string) => Promise<{ success: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// The timer starts at 15 s for the initial send, then escalates on each resend.
// ---------------------------------------------------------------------------

const OTP_LENGTH = 5;

/** Timer durations (seconds) for each resend attempt (index = resendCount). */
const RESEND_STEPS = [30, 60, 90, 120, 150] as const;

const INITIAL_TIMER_S = 15;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OTPModal({
  isOpen,
  email,
  onClose,
  onVerified,
  onMaxAttemptsReached,
  onRequestOTP,
  onVerifyOTP,
}: OTPModalProps) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIMER_S);
  const [canResend, setCanResend] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isClosingDueToLimit, setIsClosingDueToLimit] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // -------------------------------------------------------------------------
  // Countdown timer — decrements every second until it hits 0
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || canResend || isClosingDueToLimit) return;
    if (timeLeft <= 0) {
      setCanResend(true);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [isOpen, timeLeft, canResend, isClosingDueToLimit]);

  // -------------------------------------------------------------------------
  // Reset all state when the modal opens (fresh session each time)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      setDigits(Array(OTP_LENGTH).fill(""));
      setTimeLeft(INITIAL_TIMER_S);
      setCanResend(false);
      setResendCount(0);
      setError("");
      setIsClosingDueToLimit(false);
      // Give the DOM a tick to mount before focusing
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }, [isOpen]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const allFilled = digits.every((d) => d !== "");
  const otpValue = digits.join("");

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Input handlers
  // -------------------------------------------------------------------------
  function handleDigitChange(index: number, value: string): void {
    // Handle paste — user pastes a multi-character string into any box
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
      const next = Array(OTP_LENGTH).fill("");
      cleaned.split("").forEach((ch, i) => {
        next[i] = ch;
      });
      setDigits(next);
      // Move focus to the last filled box (or the one after)
      const focusIndex = Math.min(cleaned.length, OTP_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    // Single character — strip non-digits
    const ch = value.replace(/\D/g, "");
    const next = [...digits];
    next[index] = ch;
    setDigits(next);

    // Auto-advance to next box
    if (ch && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ): void {
    // On Backspace in an empty box, move focus to the previous box
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  // -------------------------------------------------------------------------
  // Resend handler
  // -------------------------------------------------------------------------
  async function handleResend(): Promise<void> {
    // Rate limit: after exhausting all RESEND_STEPS, block further attempts
    if (resendCount >= RESEND_STEPS.length) {
      setIsClosingDueToLimit(true);
      onMaxAttemptsReached();
      // Auto-close the modal after 5 seconds
      setTimeout(() => onClose(), 5000);
      return;
    }

    setDigits(Array(OTP_LENGTH).fill(""));
    setError("");
    const nextTime = RESEND_STEPS[resendCount];
    setResendCount((c) => c + 1);
    setTimeLeft(nextTime);
    setCanResend(false);

    try {
      await onRequestOTP();
      toast.success("Code sent!", { message: "Check your email for a new code" });
    } catch {
      // Non-fatal — the user can try again when the next timer expires
      console.warn("[OTPModal] Resend OTP request failed silently");
    }

    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  }

  // -------------------------------------------------------------------------
  // Submit handler
  // -------------------------------------------------------------------------
  async function handleSubmit(): Promise<void> {
    if (!allFilled || isSubmitting || isClosingDueToLimit) return;
    setIsSubmitting(true);
    setError("");

    const result = await onVerifyOTP(otpValue);
    setIsSubmitting(false);

    if (result.success) {
      onVerified();
    } else {
      setError(result.error ?? "Invalid code. Please try again.");
      // Clear digits so the user starts fresh
      setDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }

  // -------------------------------------------------------------------------
  // Keyboard shortcut — Enter submits when all digits are filled
  // -------------------------------------------------------------------------
  function handleModalKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Enter" && allFilled && !isSubmitting) {
      handleSubmit();
    }
  }

  // Don't render anything when closed
  if (!isOpen) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      // Clicking the backdrop closes the modal (unless we're in rate-limit close)
      onClick={(e) => {
        if (e.target === e.currentTarget && !isClosingDueToLimit) onClose();
      }}
      onKeyDown={handleModalKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="otp-title"
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ------------------------------------------------------------------
            Close button (top-right)
        ------------------------------------------------------------------ */}
        {!isClosingDueToLimit && (
          <button
            onClick={onClose}
            aria-label="Close verification modal"
            className="absolute top-4 right-4 text-[#40493c] hover:text-[#1a1c1c] transition-colors"
          >
            <Icon icon="solar:close-circle-linear" width={24} height={24} />
          </button>
        )}

        {/* ------------------------------------------------------------------
            Header — shield icon + title + description
        ------------------------------------------------------------------ */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "rgba(39,115,30,0.1)" }}
          >
            <Icon
              icon="solar:shield-keyhole-bold-duotone"
              width={36}
              height={36}
              color="#27731e"
            />
          </div>
          <h2
            id="otp-title"
            className="text-xl font-bold text-[#1a1c1c] mb-1"
            style={{ fontFamily: "var(--font-vastago), serif" }}
          >
            Verify Your Identity
          </h2>
          <p className="text-sm text-[#40493c] leading-relaxed">
            A 5-digit code was sent to
            <br />
            <span className="font-semibold text-[#1a1c1c]">{email}</span>
          </p>
        </div>

        {/* ------------------------------------------------------------------
            Rate-limit message — shown instead of normal UI when limit is hit
        ------------------------------------------------------------------ */}
        {isClosingDueToLimit && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 text-center">
            Too many attempts. Please re-enter your password and try again.
            Closing in 5s…
          </div>
        )}

        {/* ------------------------------------------------------------------
            Inline error (wrong code, etc.)
        ------------------------------------------------------------------ */}
        {error && !isClosingDueToLimit && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            <Icon
              icon="solar:danger-triangle-bold"
              width={16}
              height={16}
              className="shrink-0"
            />
            {error}
          </div>
        )}

        {/* ------------------------------------------------------------------
            6-digit input grid
        ------------------------------------------------------------------ */}
        {!isClosingDueToLimit && (
          <div className="flex justify-center gap-2.5 mb-6">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={OTP_LENGTH} // allows pasting full code into first box
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={isSubmitting}
                aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                className={[
                  "w-[46px] h-[56px] text-center text-xl font-bold rounded-xl border-2 outline-none",
                  "transition-all duration-150 text-[#1a1c1c] bg-white",
                  "focus:border-[#27731e] focus:ring-2 focus:ring-[#27731e]/20",
                  // When all boxes are filled — glow green across all boxes
                  allFilled
                    ? "border-[#27731e]"
                    : d
                    ? "border-[#27731e]/60"
                    : "border-[#c0cab8]",
                  isSubmitting ? "opacity-50 cursor-not-allowed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ))}
          </div>
        )}

        {/* ------------------------------------------------------------------
            Timer / Resend area
        ------------------------------------------------------------------ */}
        {!isClosingDueToLimit && (
          <div className="flex justify-center mb-6">
            {!canResend ? (
              /* Countdown timer */
              <span className="flex items-center gap-1.5 text-sm text-[#40493c]">
                <Icon
                  icon="solar:clock-circle-linear"
                  width={16}
                  height={16}
                  className="shrink-0"
                />
                Code expires in{" "}
                <span className="font-mono font-semibold tabular-nums">
                  {formatTime(timeLeft)}
                </span>
              </span>
            ) : (
              /* Resend link — shown once timer reaches 0 */
              <button
                onClick={handleResend}
                className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:underline"
                style={{ color: "#045a03" }}
              >
                <Icon
                  icon="solar:refresh-circle-linear"
                  width={16}
                  height={16}
                  className="shrink-0"
                />
                No code yet? Send it again
              </button>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------
            Confirm button
        ------------------------------------------------------------------ */}
        {!isClosingDueToLimit && (
          <button
            onClick={handleSubmit}
            disabled={!allFilled || isSubmitting}
            className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: "#fec700" }}
          >
            {isSubmitting ? (
              <>
                <Spinner size={18} />
                Verifying…
              </>
            ) : (
              "Confirm"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
