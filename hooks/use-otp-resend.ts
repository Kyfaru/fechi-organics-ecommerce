"use client";

import { useEffect, useState } from "react";

/** Seconds to wait before each successive resend becomes clickable (holds at the last value once exhausted). */
const RESEND_STEPS = [15, 30, 60, 90] as const;

/** Total resend button clicks allowed before the flow is force-terminated. */
const MAX_RESEND_CLICKS = 5;

interface UseOtpResendOptions {
  /** Sends (or resends) the code. Rejected promises are swallowed — the cooldown still advances so the user isn't stuck. */
  onSend: () => Promise<void>;
  /** Fires once the 6th resend click is attempted — caller should toast + redirect away. */
  onLimitExceeded: () => void;
}

/**
 * Drives the escalating resend-cooldown shared by the customer and admin
 * password-reset OTP steps.
 *
 * Sequence: initial send starts a 15s cooldown. Click 1 sends and starts a
 * 30s cooldown, click 2 -> 60s, click 3 -> 90s, click 4 and 5 hold at 90s.
 * The 6th click attempt is refused — onLimitExceeded fires instead of
 * sending, matching the server-side rate limiter (6 sends per 10 min: 1
 * initial + 5 resends) so client and server enforce the same cap.
 */
export function useOtpResend({ onSend, onLimitExceeded }: UseOtpResendOptions) {
  const [secondsLeft, setSecondsLeft] = useState<number>(RESEND_STEPS[0]);
  const [resendCount, setResendCount] = useState(0);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const canResend = secondsLeft <= 0 && !isSending;

  async function resend(): Promise<void> {
    if (!canResend) return;

    const nextCount = resendCount + 1;
    if (nextCount > MAX_RESEND_CLICKS) {
      onLimitExceeded();
      return;
    }

    setResendCount(nextCount);
    setIsSending(true);
    try {
      await onSend();
    } catch {
      // Non-fatal — the cooldown still advances so the user can try again later.
    } finally {
      setIsSending(false);
    }
    setSecondsLeft(RESEND_STEPS[nextCount] ?? RESEND_STEPS[RESEND_STEPS.length - 1]);
  }

  /** Restarts the whole cooldown sequence — call when a fresh OTP step begins. */
  function reset(): void {
    setSecondsLeft(RESEND_STEPS[0]);
    setResendCount(0);
    setIsSending(false);
  }

  return { secondsLeft, canResend, resendCount, isSending, resend, reset, maxResendClicks: MAX_RESEND_CLICKS };
}
