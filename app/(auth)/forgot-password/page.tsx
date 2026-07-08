"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import confetti from "canvas-confetti";
import type { Value as PhoneValue } from "react-phone-number-input";
import FormInput from "@/components/auth/FormInput";
import PhoneInput from "@/components/auth/PhoneInput";
import StrongPasswordInput from "@/components/auth/StrongPasswordInput";
import { checkRequirements } from "@/components/auth/PasswordChecklist";
import OtpPinInput from "@/components/auth/OtpPinInput";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { useOtpResend } from "@/hooks/use-otp-resend";
import { PWRESET_COMPLETION_FLAG_KEY, PWRESET_PAGE_WINDOW_MS } from "@/lib/pwreset-flag";

type Channel = "email" | "phone";
type Step = "request" | "otp" | "set-password" | "success";

/**
 * Forgot Password page — user-facing, in-page 3-step OTP wizard.
 *
 * Step 1 "request": pick email or phone, submit -> POST /api/auth/forgot-password
 * Step 2 "otp": 6-digit Preline pin input -> POST /api/auth/forgot-password/verify.
 *   On success the server returns a short-lived, single-use `resetAuth` token
 *   (Redis-backed, not a JWT). It's kept in React state only — never put in
 *   the URL — because this whole flow is now one continuous page transition,
 *   not an emailed link the user clicks later.
 * Step 3 "set-password": new password -> POST /api/auth/reset-password
 *   { resetAuth, newPassword }.
 * Step 4 "success": confetti + auto-redirect to /login, with a 15-minute
 *   sessionStorage flag that blocks revisiting this page afterward.
 *
 * app/(auth)/reset-password/page.tsx still handles the old `?token=` JWT
 * shape as a graceful "link expired" fallback for anyone with a stale
 * emailed link (nothing generates that link anymore, so in practice it will
 * only ever show its no-token state) — it shares the same completion flag
 * this page sets, from lib/pwreset-flag.ts.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("request");
  const [channel, setChannel] = useState<Channel>("email");

  // ---- Step 1 state ----
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<PhoneValue | undefined>(undefined);
  const [identifierError, setIdentifierError] = useState<string | undefined>(undefined);
  const [isRequesting, setIsRequesting] = useState(false);

  // ---- Step 2 state ----
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [pinResetSignal, setPinResetSignal] = useState(0);
  const [resetAuth, setResetAuth] = useState<string | null>(null);

  // ---- Step 3 state ----
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [policyError, setPolicyError] = useState<
    { code: "PASSWORD_CHANGE_LIMIT" } | { code: "PASSWORD_CHANGE_TOO_SOON"; nextAllowedAt: string; cooldownDays: number } | null
  >(null);

  // ---- Step 4 state ----
  const [redirectIn, setRedirectIn] = useState(5);

  const identifier = channel === "email" ? email.trim() : phone ?? "";

  // Enforce the page's 15-minute total window and block revisiting after a
  // completed reset — both read/write the same sessionStorage flag.
  useEffect(() => {
    const until = Number(sessionStorage.getItem(PWRESET_COMPLETION_FLAG_KEY) ?? 0);
    if (until && Date.now() < until) {
      window.location.href = "/login";
      return;
    }
    const timer = window.setTimeout(() => {
      window.location.href = "/login";
    }, PWRESET_PAGE_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);

  async function sendCode(): Promise<void> {
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, channel }),
    });
  }

  const resendState = useOtpResend({
    onSend: sendCode,
    onLimitExceeded: () => {
      toast.error("Too many attempts", { message: "Please try again later." });
      router.push("/");
    },
  });

  // -------------------------------------------------------------------------
  // Step 1 — request
  // -------------------------------------------------------------------------
  function validateIdentifier(): string | undefined {
    if (channel === "email") {
      if (!email.trim()) return "Email address is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    } else {
      if (!phone) return "Phone number is required.";
    }
    return undefined;
  }

  async function handleRequestSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validateIdentifier();
    if (err) {
      setIdentifierError(err);
      return;
    }
    setIdentifierError(undefined);
    setIsRequesting(true);
    try {
      await sendCode();
      resendState.reset();
      setStep("otp");
    } catch {
      toast.error("Could not send code. Please try again.");
    } finally {
      setIsRequesting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2 — otp
  // -------------------------------------------------------------------------
  async function handleOtpComplete(code: string): Promise<void> {
    if (isVerifying) return;
    setIsVerifying(true);
    setOtpError("");
    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, channel, otp: code }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setOtpError(data?.error?.message || "Invalid code. Please try again.");
        setPinResetSignal((n) => n + 1);
        return;
      }

      setResetAuth(data.resetAuth);
      setStep("set-password");
    } catch {
      setOtpError("Something went wrong. Please try again.");
      setPinResetSignal((n) => n + 1);
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResendClick(): Promise<void> {
    setOtpError("");
    setPinResetSignal((n) => n + 1);
    await resendState.resend();
  }

  // -------------------------------------------------------------------------
  // Step 3 — set new password
  // -------------------------------------------------------------------------
  function validatePassword(): boolean {
    const requirements = checkRequirements(newPassword);
    if (requirements.some((r) => !r.met)) return false;
    if (!confirmPassword || newPassword !== confirmPassword) return false;
    return true;
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!validatePassword() || !resetAuth) return;

    setIsSubmittingPassword(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetAuth, newPassword }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        const code = data?.error?.code;
        if (code === "PASSWORD_CHANGE_LIMIT" || code === "PASSWORD_CHANGE_TOO_SOON") {
          setPolicyError(data.error);
          toast.error(
            code === "PASSWORD_CHANGE_LIMIT"
              ? "Password change limit reached"
              : "Too soon to change your password again"
          );
        } else {
          toast.error(typeof data?.error === "string" ? data.error : "Failed to update password. Please try again.");
        }
        return;
      }

      const until = Date.now() + 15 * 60 * 1000;
      sessionStorage.setItem(PWRESET_COMPLETION_FLAG_KEY, String(until));
      window.history.replaceState(null, "", window.location.href);
      confetti({ particleCount: 120, spread: 80, colors: ["#27731e", "#fec700", "#a4f690"], origin: { y: 0.42 } });
      setStep("success");
    } catch {
      toast.error("Failed to update password. Please try again.");
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  // ---- Step 4 — success: countdown to auto-redirect ----
  useEffect(() => {
    if (step !== "success") return;
    if (redirectIn <= 0) {
      window.location.href = "/login";
      return;
    }
    const timer = window.setTimeout(() => setRedirectIn((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, redirectIn]);

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  const stepCopy: Record<Step, { title: string; subtitle: string }> = {
    request: {
      title: "Forgot Password",
      subtitle: "Choose email or phone, and we'll send you a 6-digit code.",
    },
    otp: {
      title: "Enter Your Code",
      subtitle: `We sent a 6-digit code to your ${channel === "email" ? "email" : "phone"}.`,
    },
    "set-password": {
      title: "New Password",
      subtitle: "Choose a new password for your account.",
    },
    success: {
      title: "Password Updated",
      subtitle: "Your password has been changed successfully.",
    },
  };

  return (
    <main className="flex min-h-screen">
      {/* ======================================================================
          LEFT PANEL — dark green botanical (identical to /login)
      ====================================================================== */}
      <aside
        className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col items-start justify-end p-12 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(39,115,30,1) 0%, rgba(39,115,30,0.5) 40%, transparent 100%), url('/img/decorative-background-image.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(164,246,144,0.15) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 80% 70%, rgba(4,90,3,0.5) 0%, transparent 55%), " +
              "radial-gradient(ellipse at 60% 100%, rgba(39,115,30,0.8) 0%, transparent 50%)",
          }}
        />
        <div
          className="absolute top-0 right-0 w-72 h-96 opacity-20 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 60% 30%, #a4f690 0%, transparent 70%)",
            transform: "rotate(15deg) translate(20%, -10%)",
            borderRadius: "60% 40% 70% 30% / 40% 50% 60% 50%",
          }}
        />
        <div
          className="absolute bottom-24 left-6 w-48 h-64 opacity-10 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 40% 60%, #a4f690 0%, transparent 70%)",
            transform: "rotate(-20deg)",
            borderRadius: "40% 60% 30% 70% / 60% 40% 70% 30%",
          }}
        />
        <div className="relative z-10 max-w-m">
          <h1
            className="text-white text-6xl xl:text-[5.5rem] leading-tight mb-4"
            style={{ fontFamily: "var(--font-vastago), serif", fontWeight: 700 }}
          >
            Rooted in
            <br />
            Nature.
          </h1>
          <p
            className="text-white/80 text-lg"
            style={{ fontFamily: "var(--font-stagnan), sans-serif" }}
          >
            Pure ingredients. Honest farming.
            <br />
            Delivered to your door.
          </p>
        </div>
        <p
          className="relative z-10 mt-6 text-white/40 text-xs tracking-widest uppercase"
          style={{ fontFamily: "var(--font-stagnan), sans-serif" }}
        >
          Fechi Organics
        </p>
      </aside>

      {/* ======================================================================
          RIGHT PANEL — white form area
      ====================================================================== */}
      <section className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-[#111412]">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[14px] text-[#40493c] dark:text-gray-400 hover:text-[#27731e] dark:hover:text-[#27731e] transition-colors"
            >
              <Icon icon="mdi:arrow-left" width={18} />
              Back to login
            </Link>
          </div>

          <div className="mb-8">
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#1a1c1c] dark:text-white mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              {stepCopy[step].title}
            </h2>
            <p className="text-sm text-[#40493c] dark:text-gray-400">{stepCopy[step].subtitle}</p>
          </div>

          {/* ----------------------------------------------------------------
              Step 1 — request (email/phone toggle + identifier)
          ---------------------------------------------------------------- */}
          {step === "request" && (
            <form onSubmit={handleRequestSubmit} noValidate className="flex flex-col gap-5">
              <div className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 p-1 gap-1 self-start">
                {(["email", "phone"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setChannel(c);
                      setIdentifierError(undefined);
                    }}
                    className={[
                      "px-6 py-2 rounded-full text-sm tracking-widest transition-all duration-200",
                      channel === c
                        ? "bg-white dark:bg-gray-700 text-[#1a1c1c] dark:text-white shadow-sm font-bold"
                        : "text-[#40493c] dark:text-gray-400 hover:text-[#1a1c1c] dark:hover:text-white font-normal",
                    ].join(" ")}
                    aria-pressed={channel === c}
                  >
                    {c === "email" ? "EMAIL" : "PHONE"}
                  </button>
                ))}
              </div>

              {channel === "email" ? (
                <FormInput
                  label="Email Address"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (identifierError) setIdentifierError(undefined);
                  }}
                  error={identifierError}
                  autoComplete="email"
                  disabled={isRequesting}
                />
              ) : (
                <PhoneInput
                  label="PHONE NUMBER"
                  value={phone}
                  onChange={(v) => {
                    setPhone(v);
                    if (identifierError) setIdentifierError(undefined);
                  }}
                  error={identifierError}
                />
              )}

              <button
                type="submit"
                disabled={isRequesting}
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: "#fec700" }}
              >
                {isRequesting ? <Spinner size={16} invert /> : "Send Code"}
              </button>
            </form>
          )}

          {/* ----------------------------------------------------------------
              Step 2 — otp
          ---------------------------------------------------------------- */}
          {step === "otp" && (
            <div className="flex flex-col gap-5">
              {otpError && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-600 dark:text-red-400">
                  <Icon icon="solar:danger-triangle-bold" width={16} height={16} className="shrink-0" />
                  {otpError}
                </div>
              )}

              <OtpPinInput
                theme="customer"
                disabled={isVerifying}
                resetSignal={pinResetSignal}
                onComplete={handleOtpComplete}
              />

              <div className="flex justify-center">
                {isVerifying ? (
                  <span className="flex items-center gap-2 text-sm text-[#40493c] dark:text-gray-400">
                    <Spinner size={14} /> Verifying…
                  </span>
                ) : resendState.canResend ? (
                  <button
                    onClick={handleResendClick}
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:underline"
                    style={{ color: "#045a03" }}
                  >
                    <Icon icon="solar:refresh-circle-linear" width={16} height={16} className="shrink-0" />
                    Resend code
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-[#40493c] dark:text-gray-400">
                    <Icon icon="solar:clock-circle-linear" width={16} height={16} className="shrink-0" />
                    Resend available in{" "}
                    <span className="font-mono font-semibold tabular-nums">{formatTime(resendState.secondsLeft)}</span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setStep("request")}
                className="text-center text-xs text-[#40493c] dark:text-gray-500 hover:underline"
              >
                Use a different email or phone
              </button>
            </div>
          )}

          {/* ----------------------------------------------------------------
              Step 3 — set new password
          ---------------------------------------------------------------- */}
          {step === "set-password" && (
            <form onSubmit={handlePasswordSubmit} noValidate className="flex flex-col gap-5">
              <StrongPasswordInput
                password={newPassword}
                confirmPassword={confirmPassword}
                onPasswordChange={setNewPassword}
                onConfirmPasswordChange={setConfirmPassword}
                disabled={isSubmittingPassword}
                submitted={hasAttemptedSubmit}
              />

              <button
                type="submit"
                disabled={isSubmittingPassword}
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
                style={{ backgroundColor: "#fec700" }}
              >
                {isSubmittingPassword ? <Spinner size={16} invert /> : "Update Password"}
              </button>
            </form>
          )}

          {/* ----------------------------------------------------------------
              Step 4 — success
          ---------------------------------------------------------------- */}
          {step === "success" && (
            <div className="flex flex-col items-center text-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eafbe7]">
                <Icon icon="mdi:check-bold" width={32} className="text-[#27731e]" />
              </div>
              <p className="text-sm text-[#40493c] dark:text-gray-400">
                Keep your new password somewhere safe and don&apos;t share it. You&apos;ll need to log
                in again with it. Redirecting to login in{" "}
                <span className="font-mono font-semibold tabular-nums">{redirectIn}s</span>…
              </p>
              <button
                type="button"
                onClick={() => (window.location.href = "/login")}
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98]"
                style={{ backgroundColor: "#fec700" }}
              >
                Go to login now
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------------
          Password-policy error modal (limit reached / too soon)
      ---------------------------------------------------------------- */}
      {policyError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
              <Icon icon="solar:danger-triangle-bold" width={20} className="text-red-500" />
            </div>
            {policyError.code === "PASSWORD_CHANGE_LIMIT" ? (
              <>
                <h3 className="mb-1 text-base font-bold text-[#1a1c1c] dark:text-white">
                  Password change limit reached
                </h3>
                <p className="text-sm text-[#40493c] dark:text-gray-400">
                  You&apos;ve reached the maximum number of password changes allowed on this
                  account. Please contact Fechi Organics support for help.
                </p>
              </>
            ) : (
              <>
                <h3 className="mb-1 text-base font-bold text-[#1a1c1c] dark:text-white">
                  Too soon to change your password
                </h3>
                <p className="text-sm text-[#40493c] dark:text-gray-400">
                  Your password can only be changed once every {policyError.cooldownDays} day
                  {policyError.cooldownDays === 1 ? "" : "s"}. You can try again on{" "}
                  {new Date(policyError.nextAllowedAt).toLocaleString()}.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={() => setPolicyError(null)}
              className="mt-5 w-full rounded-full bg-[#f0f0ef] dark:bg-gray-800 py-2.5 text-sm font-semibold text-[#1a1c1c] dark:text-white hover:brightness-95"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
