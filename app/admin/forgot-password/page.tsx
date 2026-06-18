"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, MailCheck } from "lucide-react";
import FormInput from "@/components/auth/FormInput";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";

/**
 * Admin Forgot Password page.
 *
 * Standalone page — NOT inside the (auth) group, so it has its own full layout.
 * Mirrors the admin login page structure: white left panel + gold right panel.
 *
 * API: POST /api/admin/forgot-password  { email }
 * Always returns 200 (enumeration protection).
 */

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
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
      const res = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      setSubmitted(true);
    } catch {
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
          LEFT PANEL — white form area (matches admin login layout)
      ====================================================================== */}
      <motion.section
        className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-[#111412]"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-full max-w-md">

          {/* Back to admin login */}
          <div className="mb-8">
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1.5 text-[14px] text-[#40493c] dark:text-gray-400 hover:text-[#DEAE00] dark:hover:text-[#DEAE00] transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Admin Login
            </Link>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#1a1c1c] dark:text-white mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              Admin — Forgot
              <br />
              Password
            </h2>
            <p className="text-sm text-[#40493c] dark:text-gray-400">
              Enter your admin email and we&apos;ll send you a reset link.
            </p>
          </div>

          {/* ----------------------------------------------------------------
              Success state
          ---------------------------------------------------------------- */}
          {submitted ? (
            <div
              role="status"
              className="flex flex-col gap-5 p-6 rounded-2xl bg-amber-50 dark:bg-[#2e2710] border border-amber-200 dark:border-amber-800"
            >
              <div className="flex justify-center">
                <span
                  className="flex items-center justify-center w-14 h-14 rounded-full"
                  style={{ backgroundColor: "rgba(222,174,0,0.15)" }}
                >
                  <MailCheck size={28} color="#DEAE00" />
                </span>
              </div>
              <div className="text-center">
                <p className="font-semibold text-[#1a1c1c] dark:text-white mb-1">
                  Check your email!
                </p>
                <p className="text-sm text-[#40493c] dark:text-gray-400 leading-relaxed">
                  If that admin email exists, a reset link has been sent. Check
                  your inbox and spam folder.
                </p>
              </div>
              <Link
                href="/admin/login"
                className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-center text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98]"
                style={{ backgroundColor: "#FFC800" }}
              >
                Back to Admin Login
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
                placeholder="admin@example.com"
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
                style={{ backgroundColor: "#FFC800" }}
              >
                {isLoading ? <Spinner size={16} invert /> : "Send Reset Link"}
              </button>

              {/* Footer note — restricted access reminder */}
              <p className="text-center text-xs text-[#40493c] dark:text-gray-500 mt-2">
                Access restricted to authorized staff only.
              </p>
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
        {/* Gold gradient overlay */}
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

        {/* Text content */}
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

        {/* Brand mark */}
        <p
          className="relative z-10 mt-6 text-white/40 text-xs tracking-widest uppercase"
          style={{ fontFamily: "var(--font-stagnan), sans-serif" }}
        >
          Fechi Organics — Admin
        </p>
      </motion.aside>
    </main>
  );
}
