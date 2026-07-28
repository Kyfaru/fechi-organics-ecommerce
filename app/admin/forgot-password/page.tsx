"use client";

import { useState, FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, AlertTriangle, RefreshCcw, Clock } from "lucide-react";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordChecklist, { checkRequirements } from "@/components/auth/PasswordChecklist";
import OtpPinInput from "@/components/auth/OtpPinInput";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { useOtpResend } from "@/hooks/use-otp-resend";

type Step = "request" | "channel" | "otp" | "set-password";

/**
 * Admin Forgot Password page — mirrors app/(auth)/forgot-password/page.tsx
 * for the admin self-service flow.
 *
 * Step 1 "request": email -> POST /api/admin/forgot-password/channels to
 *   check whether the admin has a phone on file. If not, skips straight to
 *   sending the email code. If so, moves to "channel".
 * Step "channel" (only shown when SMS is available): pick which channel
 *   gets the code first — POST /api/admin/forgot-password always sends to
 *   every available channel, "channel" only controls dispatch order.
 * Step 2 "otp": 6-digit Preline pin input -> POST /api/admin/forgot-password/verify
 *   returns a short-lived, single-use `resetAuth` token kept in memory only.
 * Step 3 "set-password": new password -> POST /api/admin/reset-password
 *   { resetAuth, newPassword } — that route also still accepts { token, newPassword }
 *   for the separate staff-invite flow (app/api/admin/staff/send-reset), which
 *   is untouched.
 *
 * app/admin/reset-password/page.tsx is intentionally left untouched — it
 * still serves the staff-invite `?token=` JWT link unchanged.
 */
export default function AdminForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("request");

  // ---- Step 1 ----
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [isRequesting, setIsRequesting] = useState(false);

  // ---- Step "channel" ----
  const [channel, setChannel] = useState<"email" | "sms">("email");

  // ---- Step 2 ----
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [pinResetSignal, setPinResetSignal] = useState(0);
  const [resetAuth, setResetAuth] = useState<string | null>(null);

  // ---- Step 3 ----
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState<string | undefined>(undefined);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | undefined>(undefined);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [policyError, setPolicyError] = useState<
    | { code: "PASSWORD_CHANGE_LIMIT" }
    | { code: "PASSWORD_CHANGE_TOO_SOON"; nextAllowedAt: string; cooldownDays: number }
    | null
  >(null);

  async function sendCode(ch: "email" | "sms" = channel): Promise<void> {
    await fetch("/api/admin/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), channel: ch }),
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
  function validateEmail(): string | undefined {
    if (!email.trim()) return "Email address is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    return undefined;
  }

  async function handleRequestSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validateEmail();
    if (err) {
      setEmailError(err);
      return;
    }
    setEmailError(undefined);
    setIsRequesting(true);
    try {
      const res = await fetch("/api/admin/forgot-password/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({ smsAvailable: false }));

      if (data?.smsAvailable) {
        setStep("channel");
        return;
      }

      setChannel("email");
      await sendCode("email");
      resendState.reset();
      setStep("otp");
    } catch {
      toast.error("Could not send code. Please try again.");
    } finally {
      setIsRequesting(false);
    }
  }

  async function handleChannelSubmit(): Promise<void> {
    setIsRequesting(true);
    try {
      await sendCode(channel);
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
      const res = await fetch("/api/admin/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: code }),
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
    let valid = true;

    const requirements = checkRequirements(newPassword);
    if (requirements.some((r) => !r.met)) {
      setNewPasswordError("Password does not meet all requirements.");
      valid = false;
    } else {
      setNewPasswordError(undefined);
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your password.");
      valid = false;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      valid = false;
    } else {
      setConfirmPasswordError(undefined);
    }

    return valid;
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!validatePassword() || !resetAuth) return;

    setIsSubmittingPassword(true);
    try {
      const res = await fetch("/api/admin/reset-password", {
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
          toast.error(data?.error?.message || "Failed to update password. Please try again.");
        }
        return;
      }

      toast.success("Password updated. Please log in.");
      router.push("/admin/login");
    } catch {
      toast.error("Failed to update password. Please try again.");
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  const stepCopy: Record<Step, { title: ReactNode; subtitle: string }> = {
    request: {
      title: (
        <>
          Admin — Forgot
          <br />
          Password
        </>
      ),
      subtitle: "Enter your admin email and we'll send you a 6-digit code.",
    },
    channel: {
      title: "Choose Delivery",
      subtitle: "We'll send your code to both — starting with whichever you pick.",
    },
    otp: {
      title: "Enter Your Code",
      subtitle: "We sent a 6-digit code to your email.",
    },
    "set-password": {
      title: "New Password",
      subtitle: "Choose a new password for your admin account.",
    },
  };

  return (
    <main className="flex min-h-screen">
      {/* ======================================================================
          LEFT PANEL — white form area (matches admin login layout)
      ====================================================================== */}
      <motion.section
        className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-[#111412]"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1.5 text-[14px] text-[#40493c] dark:text-gray-400 hover:text-[#DEAE00] dark:hover:text-[#DEAE00] transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Admin Login
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
              Step 1 — request
          ---------------------------------------------------------------- */}
          {step === "request" && (
            <form onSubmit={handleRequestSubmit} noValidate className="flex flex-col gap-5">
              <FormInput
                label="Email Address"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(undefined);
                }}
                error={emailError}
                autoComplete="email"
                disabled={isRequesting}
              />

              <button
                type="submit"
                disabled={isRequesting}
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: "#FFC800" }}
              >
                {isRequesting ? <Spinner size={16} invert /> : "Send Code"}
              </button>

              <p className="text-center text-xs text-[#40493c] dark:text-gray-500 mt-2">
                Access restricted to authorized staff only.
              </p>
            </form>
          )}

          {/* ----------------------------------------------------------------
              Step "channel" — pick which channel gets the code first
          ---------------------------------------------------------------- */}
          {step === "channel" && (
            <div className="flex flex-col gap-5">
              <div className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 p-1 gap-1 self-start">
                {(["email", "sms"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={[
                      "px-6 py-2 rounded-full text-sm tracking-widest transition-all duration-200",
                      channel === c
                        ? "bg-white dark:bg-gray-700 text-[#1a1c1c] dark:text-white shadow-sm font-bold"
                        : "text-[#40493c] dark:text-gray-400 hover:text-[#1a1c1c] dark:hover:text-white font-normal",
                    ].join(" ")}
                    aria-pressed={channel === c}
                  >
                    {c === "email" ? "EMAIL" : "SMS"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleChannelSubmit}
                disabled={isRequesting}
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: "#FFC800" }}
              >
                {isRequesting ? <Spinner size={16} invert /> : "Send Code"}
              </button>

              <button
                type="button"
                onClick={() => setStep("request")}
                className="text-center text-xs text-[#40493c] dark:text-gray-500 hover:underline"
              >
                Use a different email
              </button>
            </div>
          )}

          {/* ----------------------------------------------------------------
              Step 2 — otp
          ---------------------------------------------------------------- */}
          {step === "otp" && (
            <div className="flex flex-col gap-5">
              {otpError && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle size={16} className="shrink-0" />
                  {otpError}
                </div>
              )}

              <OtpPinInput
                theme="admin"
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
                    className="flex items-center gap-1.5 text-sm font-medium text-[#8a6d00] dark:text-[#DEAE00] hover:underline transition-colors"
                  >
                    <RefreshCcw size={16} className="shrink-0" />
                    Resend code
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-[#40493c] dark:text-gray-400">
                    <Clock size={16} className="shrink-0" />
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
                Use a different email
              </button>
            </div>
          )}

          {/* ----------------------------------------------------------------
              Step 3 — set new password
          ---------------------------------------------------------------- */}
          {step === "set-password" && (
            <form onSubmit={handlePasswordSubmit} noValidate className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <PasswordInput
                  label="New Password"
                  placeholder="Enter a new password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (newPasswordError) setNewPasswordError(undefined);
                  }}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  error={newPasswordError}
                  autoComplete="new-password"
                  disabled={isSubmittingPassword}
                />
                <PasswordChecklist
                  password={newPassword}
                  visible={passwordFocused || hasAttemptedSubmit}
                  submitted={hasAttemptedSubmit}
                />
              </div>

              <PasswordInput
                label="Confirm Password"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (confirmPasswordError) setConfirmPasswordError(undefined);
                }}
                error={confirmPasswordError}
                autoComplete="new-password"
                disabled={isSubmittingPassword}
              />

              <button
                type="submit"
                disabled={isSubmittingPassword}
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
                style={{ backgroundColor: "#FFC800" }}
              >
                {isSubmittingPassword ? <Spinner size={16} invert /> : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </motion.section>

      {/* ======================================================================
          RIGHT PANEL — gold botanical (identical to admin login)
      ====================================================================== */}
      <motion.aside
        className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col items-start justify-end p-12 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(222,174,0,1) 0%, rgba(222,174,0,0.5) 40%, transparent 100%), url('/img/decorative-background-image.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden="true"
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(255,228,128,0.15) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 80% 70%, rgba(180,130,0,0.5) 0%, transparent 55%), " +
              "radial-gradient(ellipse at 60% 100%, rgba(222,174,0,0.8) 0%, transparent 50%)",
          }}
        />
        <div
          className="absolute top-0 right-0 w-72 h-96 opacity-20 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 60% 30%, #FFE480 0%, transparent 70%)",
            transform: "rotate(15deg) translate(20%, -10%)",
            borderRadius: "60% 40% 70% 30% / 40% 50% 60% 50%",
          }}
        />
        <div
          className="absolute bottom-24 left-6 w-48 h-64 opacity-10 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 40% 60%, #FFE480 0%, transparent 70%)",
            transform: "rotate(-20deg)",
            borderRadius: "40% 60% 30% 70% / 60% 40% 70% 30%",
          }}
        />

        <div className="relative z-10 max-w-m">
          <h1
            className="text-white text-6xl xl:text-[5.5rem] leading-tight mb-4"
            style={{ fontFamily: "var(--font-vastago), serif", fontWeight: 700 }}
          >
            Your Admin
            <br />
            Panel.
          </h1>
          <p
            className="text-white/80 text-lg"
            style={{ fontFamily: "var(--font-stagnan), sans-serif" }}
          >
            Manage your store, your team,
            <br />
            and your business.
          </p>
        </div>

        <p
          className="relative z-10 mt-6 text-white/40 text-xs tracking-widest uppercase"
          style={{ fontFamily: "var(--font-stagnan), sans-serif" }}
        >
          Fechi Organics — Admin
        </p>
      </motion.aside>

      {/* ----------------------------------------------------------------
          Password-policy error modal (limit reached / too soon)
      ---------------------------------------------------------------- */}
      {policyError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            {policyError.code === "PASSWORD_CHANGE_LIMIT" ? (
              <>
                <h3 className="mb-1 text-base font-bold text-[#1a1c1c] dark:text-white">
                  Password change limit reached
                </h3>
                <p className="text-sm text-[#40493c] dark:text-gray-400">
                  You&apos;ve reached the maximum number of password changes allowed on this
                  account. Please contact a super admin for help.
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
