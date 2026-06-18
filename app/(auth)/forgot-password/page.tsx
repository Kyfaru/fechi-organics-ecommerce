"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import FormInput from "@/components/auth/FormInput";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";

/**
 * Forgot Password page — user-facing.
 *
 * Layout: same two-panel structure as /login (green botanical left, white right).
 * The (auth) layout.tsx wraps this automatically.
 *
 * API: POST /api/auth/forgot-password  { email }
 * Always returns 200 (enumeration protection). We show an inline success
 * state after any successful HTTP response; toast.error only on network failure.
 */

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  // Replace form with success message after submit
  const [submitted, setSubmitted] = useState(false);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function validate(): string | undefined {
    if (!email.trim()) return "Email address is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return "Enter a valid email address.";
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const err = validate();
    if (err) {
      setEmailError(err);
      return;
    }

    setEmailError(undefined);
    setIsLoading(true);

    try {
      // POST to forgot-password API — always returns 200
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        // Non-2xx is a true server error, not enumeration protection
        throw new Error(`Server error: ${res.status}`);
      }

      // Show inline success state (do not use toast per spec)
      setSubmitted(true);
    } catch {
      // Only surface a toast on genuine network / server failure
      toast.error("Could not send reset email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
        {/* Botanical gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(164,246,144,0.15) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 80% 70%, rgba(4,90,3,0.5) 0%, transparent 55%), " +
              "radial-gradient(ellipse at 60% 100%, rgba(39,115,30,0.8) 0%, transparent 50%)",
          }}
        />

        {/* Decorative leaf blobs */}
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

        {/* Text content */}
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

        {/* Brand mark */}
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
              Forgot Password
            </h2>
            <p className="text-sm text-[#40493c] dark:text-gray-400">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          {/* ----------------------------------------------------------------
              Success state — replaces the form after a successful submission
          ---------------------------------------------------------------- */}
          {submitted ? (
            <div
              role="status"
              className="flex flex-col gap-5 p-6 rounded-2xl bg-[#f0faf0] dark:bg-[#1a2e1a] border border-[#c8e6c9] dark:border-[#2d5a2d]"
            >
              {/* Icon */}
              <div className="flex justify-center">
                <span
                  className="flex items-center justify-center w-14 h-14 rounded-full"
                  style={{ backgroundColor: "rgba(39,115,30,0.12)" }}
                >
                  <Icon icon="mdi:email-check-outline" width={28} color="#27731e" />
                </span>
              </div>

              <div className="text-center">
                <p className="font-semibold text-[#1a1c1c] dark:text-white mb-1">
                  Check your email!
                </p>
                <p className="text-sm text-[#40493c] dark:text-gray-400 leading-relaxed">
                  A reset link has been sent if that address is registered. Check
                  your inbox (and spam folder) and follow the link to reset your
                  password.
                </p>
              </div>

              <Link
                href="/login"
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-center text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98]"
                style={{ backgroundColor: "#fec700" }}
              >
                Back to Login
              </Link>
            </div>
          ) : (
            /* ----------------------------------------------------------------
                Form state
            ---------------------------------------------------------------- */
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <FormInput
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(undefined);
                }}
                error={emailError}
                autoComplete="email"
                disabled={isLoading}
              />

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: "#fec700" }}
              >
                {isLoading ? <Spinner size={16} invert /> : "Send Reset Link"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
