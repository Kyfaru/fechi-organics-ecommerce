"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@/components/ui/spinner";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// State machine for the admin login flow:
//   credentials   → email + password
//   totp-verify   → enter 6-digit TOTP code (2FA already set up, method = totp)
//   totp-setup    → scan QR / copy URI, then enter code to confirm (first login)
//   otp-verify    → enter 6-digit email/SMS OTP (method = email | sms)
// ---------------------------------------------------------------------------
type AdminLoginStep = "credentials" | "totp-verify" | "totp-setup" | "otp-verify";

interface AdminLoginErrors {
  email?: string;
  password?: string;
  code?: string;
}

// Shape of GET /api/admin/me during login (called after password success)
interface AdminMeResponse {
  twoFactorEnabled: boolean;
  twoFaMethod: string;  // 'totp' | 'email' | 'sms'
  userId: string;
  email: string;
  phone: string | null;
}

export default function AdminLoginPage() {
  const router = useRouter();

  // Step 1 — credential fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 — multi-step 2FA state
  const [step, setStep] = useState<AdminLoginStep>("credentials");
  const [totpUri, setTotpUri] = useState("");
  const [code, setCode] = useState("");

  // Email/SMS OTP state
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpMethod, setOtpMethod] = useState<"email" | "sms">("email");
  const [adminUserId, setAdminUserId] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [errors, setErrors] = useState<AdminLoginErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Resend countdown timer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCountdown]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function validateCredentials(): AdminLoginErrors {
    const errs: AdminLoginErrors = {};
    if (!email.trim()) errs.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email address.";
    if (!password) errs.password = "Password is required.";
    return errs;
  }

  function validateCode(): AdminLoginErrors {
    const errs: AdminLoginErrors = {};
    if (!code.trim()) errs.code = "Verification code is required.";
    else if (!/^\d{6}$/.test(code.trim()))
      errs.code = "Enter the 6-digit code from your authenticator app.";
    return errs;
  }

  async function sendOtp(userId: string, method: "email" | "sms") {
    const res = await fetch("/api/admin/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, method }),
    });
    const json = await res.json();
    if (!json.ok && !json.sent) {
      throw new Error(json.error?.message ?? "Failed to send OTP");
    }
  }

  // ---------------------------------------------------------------------------
  // Step 1 — email + password submit
  // ---------------------------------------------------------------------------
  async function handleCredentialsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationErrors = validateCredentials();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const result = await authClient.signIn.email({ email, password });

      if (result?.error) {
        toast.error("Invalid email or password.");
        return;
      }

      // Role check — reject non-admins before they reach 2FA
      const role = (result?.data?.user as { role?: string } | undefined)?.role;
      if (role && role !== "admin") {
        await authClient.signOut();
        toast.error("Access denied — admin accounts only.");
        return;
      }

      // Fetch admin profile to determine 2FA method
      const meRes = await fetch("/api/admin/me");
      const me: AdminMeResponse = await meRes.json();

      const method = me.twoFaMethod ?? "totp";

      // Better Auth sets twoFactorRedirect when the account has 2FA enabled
      const hasTwoFactor = (result?.data as { twoFactorRedirect?: boolean } | null)
        ?.twoFactorRedirect === true;

      if (hasTwoFactor) {
        if (method === "email" || method === "sms") {
          // Send OTP and show the OTP input screen
          setAdminUserId(me.userId);
          setOtpMethod(method as "email" | "sms");
          await sendOtp(me.userId, method as "email" | "sms");
          setOtpDigits(["", "", "", "", "", ""]);
          setResendCountdown(60);
          setStep("otp-verify");
          return;
        }

        // Default — TOTP
        setStep("totp-verify");
        return;
      }

      // No 2FA configured yet — initiate TOTP setup for this admin
      const setupResult = await authClient.twoFactor.enable({ password });
      if (setupResult?.error) {
        toast.error("Could not initialize 2FA setup. Please try again.");
        return;
      }

      const uri = (setupResult?.data as { totpURI?: string } | null)?.totpURI ?? "";
      setTotpUri(uri);
      setStep("totp-setup");
    } catch {
      toast.error("Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2a — verify TOTP code (2FA already enabled, method = totp)
  // ---------------------------------------------------------------------------
  async function handleTotpVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationErrors = validateCode();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim() });

      if (result?.error) {
        setErrors({ code: "Invalid or expired code. Try again." });
        return;
      }

      router.push("/admin");
    } catch {
      setErrors({ code: "Verification failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2b — confirm TOTP setup (first login)
  // ---------------------------------------------------------------------------
  async function handleTotpSetupConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationErrors = validateCode();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim() });

      if (result?.error) {
        setErrors({ code: "Invalid code. Make sure your authenticator is synced and try again." });
        return;
      }

      router.push("/admin");
    } catch {
      setErrors({ code: "Verification failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2c — verify email/SMS OTP
  // ---------------------------------------------------------------------------
  async function handleOtpVerify() {
    const otp = otpDigits.join("");
    if (otp.length !== 6) {
      setErrors({ code: "Enter all 6 digits." });
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: adminUserId, otp }),
      });
      const json = await res.json();

      if (!json.ok) {
        setErrors({ code: json.error?.message ?? "Invalid code. Try again." });
        return;
      }

      router.push("/admin");
    } catch {
      setErrors({ code: "Verification failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setErrors({});

    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 filled
    if (digit && index === 5) {
      const fullOtp = next.join("");
      if (fullOtp.length === 6) {
        // Small delay so state settles before submit
        setTimeout(() => {
          setOtpDigits(next);
        }, 0);
      }
    }
  }

  // Auto-submit when all digits filled
  useEffect(() => {
    if (step === "otp-verify" && otpDigits.every((d) => d !== "") && !isLoading) {
      handleOtpVerify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpDigits, step]);

  async function handleResendOtp() {
    if (resendCountdown > 0) return;
    try {
      await sendOtp(adminUserId, otpMethod);
      setResendCountdown(60);
      toast.success("New code sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resend code");
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  function renderCredentialsForm() {
    return (
      <form onSubmit={handleCredentialsSubmit} noValidate className="flex flex-col gap-5">
        <FormInput
          label="Email Address"
          type="email"
          placeholder="admin@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={errors.email}
          autoComplete="email"
          disabled={isLoading}
        />

        <div className="flex flex-col gap-1">
          <PasswordInput
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={errors.password}
            autoComplete="current-password"
            disabled={isLoading}
          />

          <div className="flex justify-end mt-1">
            <Link
              href="/admin/forgot-password"
              className="text-xs font-medium hover:underline transition-all"
              style={{ color: "#DEAE00" }}
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          style={{ backgroundColor: "#FFC800" }}
        >
          {isLoading ? <Spinner size={16} invert /> : "Sign In"}
        </button>
      </form>
    );
  }

  function renderTotpVerify() {
    return (
      <form onSubmit={handleTotpVerify} noValidate className="flex flex-col gap-5">
        <p className="text-sm text-[#40493c] text-center">
          Enter the 6-digit code from your authenticator app.
        </p>

        <FormInput
          label="Authenticator Code"
          type="text"
          inputMode="numeric"
          placeholder="000000"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            if (errors.code) setErrors((prev) => ({ ...prev, code: undefined }));
          }}
          error={errors.code}
          autoComplete="one-time-code"
          disabled={isLoading}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          style={{ backgroundColor: "#FFC800" }}
        >
          {isLoading ? <Spinner size={16} invert /> : "Verify Code"}
        </button>

        <button
          type="button"
          onClick={() => { setStep("credentials"); setCode(""); setErrors({}); }}
          className="text-xs text-[#40493c] hover:underline text-center"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  function renderTotpSetup() {
    return (
      <form onSubmit={handleTotpSetupConfirm} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[#1a1c1c] text-center">
            Set up Two-Factor Authentication
          </p>
          <p className="text-xs text-[#40493c] text-center">
            Scan the QR code with your authenticator app, then enter the 6-digit code it generates.
          </p>
        </div>

        {totpUri && (
          <div className="flex flex-col items-center gap-3">
            <QRCodeSVG value={totpUri} size={200} bgColor="#ffffff" fgColor="#1a1c1c" level="M" />
            <p className="text-xs text-[#40493c] text-center">Scan with Google Authenticator or Authy</p>
            <details className="w-full">
              <summary className="text-[11px] text-[#40493c] cursor-pointer hover:underline text-center">
                Can&apos;t scan? Use manual entry
              </summary>
              <textarea
                readOnly
                value={totpUri}
                rows={3}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="mt-2 w-full px-3 py-2 rounded-xl border border-[#c0cab8] bg-[#f9faf8] text-[10px] font-mono resize-none focus:outline-none"
              />
            </details>
          </div>
        )}

        <FormInput
          label="Confirm — enter the code from your app"
          type="text"
          inputMode="numeric"
          placeholder="000000"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            if (errors.code) setErrors((prev) => ({ ...prev, code: undefined }));
          }}
          error={errors.code}
          autoComplete="one-time-code"
          disabled={isLoading}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          style={{ backgroundColor: "#FFC800" }}
        >
          {isLoading ? <Spinner size={16} invert /> : "Confirm & Enter Admin Panel"}
        </button>
      </form>
    );
  }

  function renderOtpVerify() {
    const methodLabel = otpMethod === "email" ? "email address" : "phone number";

    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-[#40493c] text-center">
          A 6-digit code was sent to your {methodLabel}. Enter it below.
        </p>

        {/* 6-box OTP input */}
        <div className="flex justify-center gap-x-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <input
              key={i}
              ref={(el) => { otpRefs.current[i] = el; }}
              type="text"
              maxLength={1}
              inputMode="numeric"
              className="block w-10 h-10 text-center bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-md text-sm text-gray-800 dark:text-neutral-200 placeholder:text-gray-500 dark:placeholder:text-neutral-400 focus:border-blue-700 dark:focus:border-blue-600 focus:ring-1 focus:ring-blue-700 dark:focus:ring-blue-600 outline-none"
              placeholder="○"
              value={otpDigits[i]}
              onChange={(e) => handleOtpChange(i, e.target.value)}
              onKeyDown={(e) => {
                // Backspace: clear current cell and go back
                if (e.key === "Backspace" && !otpDigits[i] && i > 0) {
                  const next = [...otpDigits];
                  next[i - 1] = "";
                  setOtpDigits(next);
                  otpRefs.current[i - 1]?.focus();
                }
              }}
              disabled={isLoading}
            />
          ))}
        </div>

        {errors.code && (
          <p className="text-xs text-red-500 text-center">{errors.code}</p>
        )}

        {isLoading && (
          <div className="flex justify-center">
            <Spinner size={20} />
          </div>
        )}

        {/* Resend button */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resendCountdown > 0 || isLoading}
            className="text-xs text-[#40493c] hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend code"}
          </button>

          <button
            type="button"
            onClick={() => { setStep("credentials"); setOtpDigits(["", "", "", "", "", ""]); setErrors({}); }}
            className="text-xs text-[#40493c] hover:underline text-center"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Heading text per step
  // ---------------------------------------------------------------------------
  const headingByStep: Record<AdminLoginStep, { title: string; subtitle: string }> = {
    "credentials": { title: "Admin Login", subtitle: "Sign in to the admin panel" },
    "totp-verify": { title: "Two-Factor Auth", subtitle: "Step 2 of 2 — verify your identity" },
    "totp-setup":  { title: "Set Up 2FA", subtitle: "One-time setup for your account" },
    "otp-verify":  { title: "Verify Code", subtitle: "Step 2 of 2 — enter your one-time code" },
  };

  const { title, subtitle } = headingByStep[step];

  // ---------------------------------------------------------------------------
  // Render — split-panel layout
  // ---------------------------------------------------------------------------
  return (
    <main className="flex min-h-screen">
      {/* ====================================================================
          LEFT PANEL — white form area
      ==================================================================== */}
      <motion.section
        className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-gray-950"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#1a1c1c] dark:text-white mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              {title}
            </h2>
            <p className="text-sm text-[#40493c] dark:text-gray-400">{subtitle}</p>
          </div>

          {step === "credentials" && renderCredentialsForm()}
          {step === "totp-verify" && renderTotpVerify()}
          {step === "totp-setup" && renderTotpSetup()}
          {step === "otp-verify" && renderOtpVerify()}

          <p className="text-center text-xs text-[#40493c] dark:text-gray-400 mt-8">
            Access restricted to authorized staff only.
          </p>
        </div>
      </motion.section>

      {/* ====================================================================
          RIGHT PANEL — gold botanical (unchanged)
      ==================================================================== */}
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
    </main>
  );
}
