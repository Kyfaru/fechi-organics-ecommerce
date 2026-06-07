"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@/components/ui/spinner";

// ---------------------------------------------------------------------------
// State machine for the 3-step admin login flow:
//   credentials  → email + password
//   totp-verify  → enter 6-digit TOTP code (2FA already set up)
//   totp-setup   → scan QR / copy URI, then enter code to confirm (first login)
// ---------------------------------------------------------------------------
type AdminLoginStep = "credentials" | "totp-verify" | "totp-setup";

interface AdminLoginErrors {
  email?: string;
  password?: string;
  code?: string;
  general?: string;
}

export default function AdminLoginPage() {
  const router = useRouter();

  // Step 1 — credential fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 — TOTP state
  const [step, setStep] = useState<AdminLoginStep>("credentials");
  const [totpUri, setTotpUri] = useState("");
  const [code, setCode] = useState("");

  const [errors, setErrors] = useState<AdminLoginErrors>({});
  const [isLoading, setIsLoading] = useState(false);

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

  // ---------------------------------------------------------------------------
  // Step 1 — email + password submit
  // Signs in with Better Auth, then branches to TOTP verify or TOTP setup.
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
        setErrors({ general: "Invalid email or password." });
        return;
      }

      // Role check — reject non-admins before they reach TOTP.
      const role = (result?.data?.user as { role?: string } | undefined)?.role;
      if (role && role !== "admin") {
        await authClient.signOut();
        setErrors({ general: "Access denied — admin accounts only." });
        return;
      }

      // Better Auth sets twoFactorRedirect when the account has 2FA enabled.
      const hasTwoFactor = (result?.data as { twoFactorRedirect?: boolean } | null)
        ?.twoFactorRedirect === true;

      if (hasTwoFactor) {
        // 2FA is already set up — prompt for the TOTP code.
        setStep("totp-verify");
        return;
      }

      // No 2FA configured yet — initiate setup for this admin.
      const setupResult = await authClient.twoFactor.enable({ password });
      if (setupResult?.error) {
        setErrors({ general: "Could not initialize 2FA setup. Please try again." });
        return;
      }

      const uri = (setupResult?.data as { totpURI?: string } | null)?.totpURI ?? "";
      setTotpUri(uri);
      setStep("totp-setup");
    } catch {
      setErrors({ general: "Sign-in failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2a — verify TOTP code (2FA already enabled)
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
  // Step 2b — confirm TOTP setup (first login — code proves the app is synced)
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
  // Render helpers — each step replaces the form area only (layout unchanged)
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

          {/* Forgot password — gold accent instead of green */}
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

        {/* CTA button */}
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
            // Allow only digits, max 6 characters
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
    // qrcode.react is not in this project's dependencies. Display the raw
    // TOTP URI as copyable text so the admin can paste it into their
    // authenticator app (Google Authenticator, Authy, etc. all support
    // manual entry). The URI contains the secret, issuer, and account name.
    return (
      <form onSubmit={handleTotpSetupConfirm} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[#1a1c1c] text-center">
            Set up Two-Factor Authentication
          </p>
          <p className="text-xs text-[#40493c] text-center">
            Copy the URI below and paste it into your authenticator app
            (Google Authenticator, Authy, 1Password, etc.) as a manual entry,
            then enter the 6-digit code it generates.
          </p>
        </div>

        {/* TOTP URI — copyable text field */}
        {totpUri && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#40493c]">TOTP URI</label>
            <textarea
              readOnly
              value={totpUri}
              rows={3}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="w-full px-3 py-2 rounded-xl border border-[#c0cab8] bg-[#f9faf8] text-xs font-mono text-[#1a1c1c] resize-none cursor-text focus:outline-none focus:border-[#DEAE00]"
              aria-label="TOTP URI — click to select all"
            />
            <p className="text-[10px] text-[#40493c]">Click the field to select all, then copy.</p>
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

  // ---------------------------------------------------------------------------
  // Heading text per step
  // ---------------------------------------------------------------------------
  const headingByStep: Record<AdminLoginStep, { title: string; subtitle: string }> = {
    "credentials": { title: "Admin Login", subtitle: "Sign in to the admin panel" },
    "totp-verify": { title: "Two-Factor Auth", subtitle: "Step 2 of 2 — verify your identity" },
    "totp-setup": { title: "Set Up 2FA", subtitle: "One-time setup for your account" },
  };

  const { title, subtitle } = headingByStep[step];

  // ---------------------------------------------------------------------------
  // Render — split-panel layout preserved; only the form area changes per step
  // ---------------------------------------------------------------------------
  return (
    <main className="flex min-h-screen">
      {/* ====================================================================
          LEFT PANEL — white form area
      ==================================================================== */}
      <motion.section
        className="flex-1 flex items-center justify-center px-6 py-12 bg-white"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-full max-w-md">
          {/* Heading — updates per step */}
          <div className="mb-8 text-center">
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#1a1c1c] mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              {title}
            </h2>
            <p className="text-sm text-[#40493c]">{subtitle}</p>
          </div>

          {/* General error banner */}
          {errors.general && (
            <div
              role="alert"
              className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600"
            >
              {errors.general}
            </div>
          )}

          {/* Active step */}
          {step === "credentials" && renderCredentialsForm()}
          {step === "totp-verify" && renderTotpVerify()}
          {step === "totp-setup" && renderTotpSetup()}

          {/* Footer note — no signup; access is restricted */}
          <p className="text-center text-xs text-[#40493c] mt-8">
            Access restricted to authorized staff only.
          </p>
        </div>
      </motion.section>

      {/* ====================================================================
          RIGHT PANEL — gold botanical (unchanged from original)
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

        {/* Decorative leaf blobs */}
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
