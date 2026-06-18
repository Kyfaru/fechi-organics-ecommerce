"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@iconify/react";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordChecklist, { checkRequirements } from "@/components/auth/PasswordChecklist";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";

/**
 * Reset Password page — user-facing.
 *
 * Layout: same two-panel structure as /login (green botanical left, white right).
 * The (auth) layout.tsx wraps this automatically.
 *
 * Reads ?token= from the URL via useSearchParams (must be inside Suspense).
 * API: POST /api/auth/reset-password  { token, newPassword, confirmPassword }
 *   - success: { ok: true }  → toast.success + router.push("/login")
 *   - failure: { error: { message: string } }  → toast.error
 */

// ---------------------------------------------------------------------------
// Inner component — uses useSearchParams so it must be in a Suspense boundary
// ---------------------------------------------------------------------------
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Inline validation errors
  const [newPasswordError, setNewPasswordError] = useState<string | undefined>(undefined);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | undefined>(undefined);

  const [isLoading, setIsLoading] = useState(false);
  // Track whether the form has been submitted to show red X on unmet requirements
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // ---------------------------------------------------------------------------
  // No-token guard — show error state instead of form
  // ---------------------------------------------------------------------------
  if (!token) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-5 p-6 rounded-2xl bg-red-50 dark:bg-[#2e1a1a] border border-red-200 dark:border-red-900"
      >
        <div className="flex justify-center">
          <span
            className="flex items-center justify-center w-14 h-14 rounded-full"
            style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
          >
            <Icon icon="mdi:link-off" width={28} color="#ef4444" />
          </span>
        </div>
        <div className="text-center">
          <p className="font-semibold text-[#1a1c1c] dark:text-white mb-1">
            Invalid reset link
          </p>
          <p className="text-sm text-[#40493c] dark:text-gray-400 leading-relaxed">
            This link is missing a reset token. It may have expired or been
            used already.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-center text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98]"
          style={{ backgroundColor: "#fec700" }}
        >
          Request new link
        </Link>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function validate(): boolean {
    let valid = true;

    // Check all password requirements are met
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

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    if (!validate()) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        // API returns { error: { message } } on failure
        const message =
          data?.error?.message || "Failed to update password. Please try again.";
        toast.error(message);
        return;
      }

      // Success
      toast.success("Password updated. Please log in.");
      router.push("/login");
    } catch {
      toast.error("Failed to update password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render — form
  // ---------------------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
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
          disabled={isLoading}
        />
        {/* Password requirements checklist — visible when focused or after a
            failed submit attempt so the user always sees what's wrong */}
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
        disabled={isLoading}
      />

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
        style={{ backgroundColor: "#fec700" }}
      >
        {isLoading ? <Spinner size={16} invert /> : "Update Password"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page shell — provides the two-panel layout and Suspense boundary
// ---------------------------------------------------------------------------
export default function ResetPasswordPage() {
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

          {/* Back to login */}
          <div className="mb-8">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[14px] text-[#40493c] dark:text-gray-400 hover:text-[#27731e] dark:hover:text-[#27731e] transition-colors"
            >
              <Icon icon="mdi:arrow-left" width={18} />
              Back to login
            </Link>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#1a1c1c] dark:text-white mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              Reset Password
            </h2>
            <p className="text-sm text-[#40493c] dark:text-gray-400">
              Enter your new password below.
            </p>
          </div>

          {/* useSearchParams requires a Suspense boundary */}
          <Suspense fallback={<div className="h-48 flex items-center justify-center"><Spinner size={24} /></div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
