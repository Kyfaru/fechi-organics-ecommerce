"use client";

import { useState, useEffect, useRef, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@iconify/react";
import { QRCodeSVG } from "qrcode.react";
import AuthToggle from "@/components/auth/AuthToggle";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import OTPModal from "@/components/auth/OTPModal";
import Turnstile, { TurnstileHandle } from "@/components/auth/Turnstile";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import { storeUser } from "@/lib/user-store";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { posthog } from "@/lib/posthog";
import { checkPortalMatch } from "@/lib/portal-check";
import { reportError } from "@/lib/observability";

interface LoginErrors {
  email?: string;
  password?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// State machine for the customer login flow — mirrors app/admin/login/page.tsx's
// proven shape:
//   credentials   → email + password (real password check via signIn.email)
//   method-choice → explicit 2FA method picker (Authenticator / Email / SMS)
//   totp-setup    → scan QR / copy URI, then enter code to confirm (first login)
//   totp-verify   → enter 6-digit TOTP code (2FA already set up, method = totp)
//   otp-verify    → OTPModal — enter 6-digit email/SMS code
// ---------------------------------------------------------------------------
type LoginStep = "credentials" | "method-choice" | "totp-setup" | "totp-verify" | "otp-verify";

interface AccountStatus {
  phone: string | null;
  twoFaEmail: boolean;
  twoFaPhone: boolean;
  twoFactorEnabled: boolean;
}

// Isolated component so useSearchParams is inside a Suspense boundary
function LoginSearchParamsReader() {
  const searchParams = useSearchParams();

  // Better Auth redirects OAuth errors (e.g. a banned user) back here as
  // ?error=CODE&error_description=... instead of its own bare error page —
  // show it as a toast rather than leaving the raw query string on screen.
  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    const description = searchParams.get("error_description");
    toast.error(
      error === "BANNED_USER" ? "Account suspended" : "Sign-in failed",
      { message: description || "Please try again or contact support." }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // 2FA state machine
  const [step, setStep] = useState<LoginStep>("credentials");
  const [twoFactorMethods, setTwoFactorMethods] = useState<string[]>([]);
  const [isNewUser, setIsNewUser] = useState(false);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [methodChoiceLoading, setMethodChoiceLoading] = useState<"totp" | "email" | "sms" | null>(null);
  const [totpUri, setTotpUri] = useState("");
  const [code, setCode] = useState("");
  // Only known when THIS browser just picked/configured the channel (new-user
  // setup, or a returning user's per-login choice) — drives OTPModal's
  // "code sent to ___" copy.
  const [otpDestination, setOtpDestination] = useState("");

  const { data: sessionData, isPending: sessionPending } = useSession();

  // ---------------------------------------------------------------------------
  // On mount: an already-correct client session skips straight to /. A
  // session for the wrong portal (an admin's) is signed out — re-verified
  // against a cache-bypassing session read first, since the cached
  // useSession() value can be stale for up to 5 minutes (cookieCache) and a
  // false positive here would sign out a session that's actually fine.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (sessionPending || !sessionData?.session || step !== "credentials") return;
    const role = (sessionData.user as { role?: string } | undefined)?.role;
    if (role !== "admin") {
      router.replace("/");
      return;
    }
    let cancelled = false;
    authClient.getSession({ query: { disableCookieCache: true } }).then(({ data: fresh }) => {
      if (cancelled) return;
      if ((fresh?.user as { role?: string } | undefined)?.role === "admin") {
        signOut();
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPending, sessionData, step]);

  // ---------------------------------------------------------------------------
  // Form validation
  // ---------------------------------------------------------------------------
  function validate(): LoginErrors {
    const errs: LoginErrors = {};
    if (!email.trim()) errs.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email address.";
    if (!password) errs.password = "Password is required.";
    return errs;
  }

  function validateCode(): LoginErrors {
    const errs: LoginErrors = {};
    if (!code.trim()) errs.code = "Verification code is required.";
    else if (!/^\d{6}$/.test(code.trim())) errs.code = "Enter the 6-digit code from your authenticator app.";
    return errs;
  }

  // ---------------------------------------------------------------------------
  // Login completion — shared by the TOTP and OTP verify paths, plus the
  // no-2FA-configured branch of credential submit.
  // ---------------------------------------------------------------------------
  function completeLogin(user: Record<string, unknown> | undefined) {
    if (user) {
      // Defense-in-depth fallback — reject an admin account here too, in
      // case checkPortalMatch (handleCredentialsSubmit) was ever bypassed.
      if (user.role === "admin") {
        signOut();
        toast.error("An account with this email already exists.");
        setStep("credentials");
        return;
      }
      storeUser({
        id: user.id as string,
        name: user.name as string,
        email: user.email as string,
        firstName: (user.firstName as string | null) ?? null,
        lastName: (user.lastName as string | null) ?? null,
        companyId: (user.companyId as string | null) ?? null,
        image: (user.image as string | null) ?? null,
      });
      posthog.identify(user.id as string, { email: user.email as string, name: user.name as string });
      posthog.capture("login_completed", { method: step === "totp-verify" || step === "totp-setup" ? "totp" : "otp" });
    }
    toast.success("Welcome back!");
    router.replace("/");
    router.refresh();
  }

  // ---------------------------------------------------------------------------
  // Step 1 — email + password submit. Now a real credential check
  // (signIn.email), not just an OTP trigger — Better Auth's twoFactor plugin
  // intercepts this call for any account with 2FA already enabled.
  // ---------------------------------------------------------------------------
  async function handleCredentialsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (!captchaToken) return;

    setErrors({});
    setIsLoading(true);
    const tokenForThisAttempt = captchaToken;
    setCaptchaToken(null);

    try {
      const portalOk = await checkPortalMatch(email, "client");
      if (!portalOk) {
        setErrors({ email: "An account with this email already exists." });
        return;
      }

      const result = await authClient.signIn.email(
        { email, password, rememberMe: true },
        { headers: { "x-captcha-response": tokenForThisAttempt } }
      );

      if (result?.error) {
        setErrors({ password: "Incorrect email or password." });
        return;
      }

      const twoFactorRedirect = (result?.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect === true;
      if (twoFactorRedirect) {
        const methods = (result?.data as { twoFactorMethods?: string[] } | null)?.twoFactorMethods ?? [];
        setTwoFactorMethods(methods);
        setAccountStatus(null);
        setIsNewUser(false);
        setStep("method-choice");
        return;
      }

      // No redirect — this account has no 2FA configured yet. signIn.email()
      // minted a real session, so it's safe to fetch account status now.
      const role = (result?.data?.user as { role?: string } | undefined)?.role;
      if (role === "admin") {
        await signOut();
        setErrors({ email: "An account with this email already exists." });
        return;
      }

      const statusRes = await fetch("/api/account/2fa/status");
      if (statusRes.ok) {
        setAccountStatus(await statusRes.json().then((j) => j.data));
      }
      setIsNewUser(true);
      setStep("method-choice");
    } catch (err) {
      reportError(err, { route: "login", tags: { step: "credentials" } });
      toast.error("Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
      turnstileRef.current?.reset();
    }
  }

  // ---------------------------------------------------------------------------
  // Method-choice step
  // ---------------------------------------------------------------------------
  async function handleMethodChoice(method: "totp" | "email" | "sms") {
    if (methodChoiceLoading) return;
    setErrors({});
    setMethodChoiceLoading(method);

    try {
      if (method === "totp") {
        if (isNewUser) {
          const setupResult = await authClient.twoFactor.enable({ password });
          if (setupResult?.error) {
            toast.error("Could not initialize 2FA setup. Please try again.");
            return;
          }
          setTotpUri((setupResult?.data as { totpURI?: string } | null)?.totpURI ?? "");
          setCode("");
          setStep("totp-setup");
        } else {
          setCode("");
          setStep("totp-verify");
        }
        return;
      }

      // method === "email" | "sms"
      if (isNewUser) {
        const res = await fetch("/api/account/2fa/method", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            method === "sms" ? { method: "sms", phone: accountStatus?.phone ?? undefined } : { method: "email" }
          ),
        });
        const json = await res.json();
        if (!json.ok) {
          toast.error(json.error?.message ?? "Failed to set 2FA method.");
          return;
        }
      }

      setOtpDestination(method === "sms" ? (accountStatus?.phone ?? "your phone") : email);

      const sendResult = await authClient.twoFactor.sendOtp({}, { headers: { "x-2fa-channel": method } });
      if (sendResult?.error) {
        toast.error(sendResult.error.message ?? "Failed to send code. Please try again.");
        return;
      }
      setStep("otp-verify");
    } catch (e) {
      reportError(e, { route: "login", tags: { step: "method-choice" } });
      toast.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setMethodChoiceLoading(null);
    }
  }

  // ---------------------------------------------------------------------------
  // TOTP verify / setup-confirm — same call, either step
  // ---------------------------------------------------------------------------
  async function handleTotpSubmit(e: FormEvent<HTMLFormElement>) {
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
        setErrors({ code: step === "totp-setup" ? "Invalid code. Make sure your authenticator is synced and try again." : "Invalid or expired code. Try again." });
        return;
      }
      completeLogin(result?.data?.user as Record<string, unknown> | undefined);
    } catch (err) {
      reportError(err, { route: "login", tags: { step } });
      setErrors({ code: "Verification failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // OTPModal callbacks — email/SMS code entry
  // ---------------------------------------------------------------------------
  async function handleVerifyOTP(otp: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await authClient.twoFactor.verifyOtp({ code: otp });
      if (result?.error) return { success: false, error: result.error.message ?? "Invalid or expired code." };
      completeLogin(result?.data?.user as Record<string, unknown> | undefined);
      return { success: true };
    } catch (err) {
      reportError(err, { route: "login", tags: { step: "otp-verify" } });
      return { success: false, error: "Verification failed. Please try again." };
    }
  }

  // ---------------------------------------------------------------------------
  // Social auth handlers
  // ---------------------------------------------------------------------------
  async function handleGoogleSignIn() {
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" });
    } catch (err) {
      reportError(err, { route: "login", tags: { step: "google-signin" } });
      toast.error("Google sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFacebookSignIn() {
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider: "facebook", callbackURL: "/", errorCallbackURL: "/login" });
    } catch (err) {
      reportError(err, { route: "login", tags: { step: "facebook-signin" } });
      toast.error("Facebook sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers — method-choice / TOTP steps
  // ---------------------------------------------------------------------------
  function renderMethodChoice() {
    type Card = { method: "totp" | "email" | "sms"; icon: string; title: string; description: string };

    const totpCard: Card = { method: "totp", icon: "mdi:cellphone-key", title: "Authenticator App", description: "Use Google Authenticator, Authy, or any TOTP app." };
    const emailCard: Card = { method: "email", icon: "mdi:email-outline", title: "Email OTP", description: "Receive a one-time code at your email address." };
    const smsCard: Card = { method: "sms", icon: "mdi:message-text-outline", title: "SMS OTP", description: "Receive a one-time code via text message." };

    const cards: Card[] = isNewUser
      ? [totpCard, emailCard, ...(accountStatus?.phone ? [smsCard] : [])]
      : [
          ...(twoFactorMethods.includes("totp") ? [totpCard] : []),
          ...(twoFactorMethods.includes("otp") ? [emailCard, smsCard] : []),
        ];

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[#40493c] dark:text-gray-400 text-center mb-1">
          Choose how you&apos;d like to verify your identity.
        </p>
        {cards.map(({ method, icon, title, description }) => (
          <button
            key={method}
            type="button"
            onClick={() => handleMethodChoice(method)}
            disabled={!!methodChoiceLoading}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-[#c0cab8] dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-[#27731e] hover:bg-[#f9faf8] dark:hover:bg-gray-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="w-10 h-10 rounded-[10px] bg-[rgba(39,115,30,0.1)] flex items-center justify-center shrink-0">
              <Icon icon={icon} width={20} color="#27731e" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1a1c1c] dark:text-white">{title}</p>
              <p className="text-xs text-[#40493c] dark:text-gray-400">{description}</p>
            </div>
            {methodChoiceLoading === method && <Spinner size={16} />}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setStep("credentials"); setErrors({}); }}
          className="text-xs text-[#40493c] dark:text-gray-400 hover:underline text-center mt-1"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  function renderTotpForm(isSetup: boolean) {
    return (
      <form onSubmit={handleTotpSubmit} noValidate className="flex flex-col gap-5">
        {isSetup && (
          <>
            <p className="text-sm text-[#40493c] dark:text-gray-400 text-center">
              Scan the QR code with your authenticator app, then enter the 6-digit code it generates.
            </p>
            {totpUri && (
              <div className="flex flex-col items-center gap-3">
                <QRCodeSVG value={totpUri} size={180} bgColor="#ffffff" fgColor="#1a1c1c" level="M" />
                <details className="w-full">
                  <summary className="text-[11px] text-[#40493c] dark:text-gray-400 cursor-pointer hover:underline text-center">
                    Can&apos;t scan? Use manual entry
                  </summary>
                  <textarea
                    readOnly
                    value={totpUri}
                    rows={3}
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    className="mt-2 w-full px-3 py-2 rounded-xl border border-[#c0cab8] dark:border-gray-600 bg-[#f9faf8] dark:bg-gray-800 text-[10px] font-mono resize-none focus:outline-none"
                  />
                </details>
              </div>
            )}
          </>
        )}
        {!isSetup && (
          <p className="text-sm text-[#40493c] dark:text-gray-400 text-center">
            Enter the 6-digit code from your authenticator app.
          </p>
        )}
        <FormInput
          label="Authenticator Code"
          type="text"
          inputMode="numeric"
          placeholder="000000"
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); if (errors.code) setErrors((p) => ({ ...p, code: undefined })); }}
          error={errors.code}
          autoComplete="one-time-code"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#fec700" }}
        >
          {isLoading ? <Spinner size={16} invert /> : isSetup ? "Confirm & Continue" : "Verify Code"}
        </button>
        <button
          type="button"
          onClick={() => { setStep("method-choice"); setCode(""); setErrors({}); }}
          className="text-xs text-[#40493c] dark:text-gray-400 hover:underline text-center"
        >
          Back to verification methods
        </button>
      </form>
    );
  }

  const stepHeading: Record<LoginStep, { title: string; subtitle: string }> = {
    "credentials": { title: "Welcome Back", subtitle: "Sign in to your Fechi Organics account" },
    "method-choice": { title: "Verify Identity", subtitle: "Step 2 of 2 — choose a verification method" },
    "totp-setup": { title: "Set Up 2FA", subtitle: "One-time setup for your account" },
    "totp-verify": { title: "Two-Factor Auth", subtitle: "Step 2 of 2 — verify your identity" },
    "otp-verify": { title: "Welcome Back", subtitle: "Sign in to your Fechi Organics account" },
  };
  const { title, subtitle } = stepHeading[step];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="flex min-h-screen">
      {/* Read search-params inside Suspense to satisfy Next.js static-render rules */}
      <Suspense fallback={null}>
        <LoginSearchParamsReader />
      </Suspense>
      {/* ====================================================================
          LEFT PANEL — dark green botanical
      ==================================================================== */}
      <aside
        className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col items-start justify-end p-12 overflow-hidden"
        style={{
          backgroundImage: "linear-gradient(to top, rgba(39,115,30,1) 0%, rgba(39,115,30,0.5) 40%, transparent 100%), url('/img/decorative-background-image.png')",
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

        {/* Decorative leaf shapes */}
        <div
          className="absolute top-0 right-0 w-72 h-96 opacity-20 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 60% 30%, #a4f690 0%, transparent 70%)",
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

      {/* ====================================================================
          RIGHT PANEL — white form area
      ==================================================================== */}
      <section className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md">

          {/* Back to home */}
          <div className="mb-4">
            <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] text-[#40493c] dark:text-gray-400 hover:text-[#27731e] dark:hover:text-[#27731e] transition-colors">
              <Icon icon="mdi:arrow-left" width={18} />
              Back to home
            </Link>
          </div>

          {/* Toggle — only on the credentials step */}
          {step === "credentials" && (
            <div className="flex justify-center mb-10">
              <AuthToggle active="login" />
            </div>
          )}

          {/* Heading */}
          <div className="mb-8 text-center">
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#1a1c1c] dark:text-white mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              {title}
            </h2>
            <p className="text-sm text-[#40493c] dark:text-gray-400">{subtitle}</p>
          </div>

          {step === "credentials" && (
            <>
              <form onSubmit={handleCredentialsSubmit} noValidate className="flex flex-col gap-5">
                <FormInput
                  label="Email Address"
                  type="email"
                  placeholder="you@example.com"
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

                  {/* Forgot password */}
                  <div className="flex justify-end mt-1">
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium hover:underline transition-all"
                      style={{ color: "#045a03" }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                </div>

                <Turnstile
                  ref={turnstileRef}
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken(null)}
                  className="flex justify-center"
                />

                <button
                  type="submit"
                  disabled={isLoading || !captchaToken}
                  className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                  style={{ backgroundColor: "#fec700" }}
                >
                  {isLoading ? <Spinner size={16} invert /> : "Log In"}
                </button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center my-6">
                <div className="flex-1 h-px bg-[#c0cab8] dark:bg-gray-700" />
                <span className="px-3 text-xs text-[#40493c] dark:text-gray-400">or continue with</span>
                <div className="flex-1 h-px bg-[#c0cab8] dark:bg-gray-700" />
              </div>

              {/* Social */}
              <SocialAuthButtons
                onGoogleClick={handleGoogleSignIn}
                onFacebookClick={handleFacebookSignIn}
                isLoading={isLoading}
              />

              {/* Footer */}
              <p className="text-center text-sm text-[#40493c] dark:text-gray-400 mt-8">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="font-semibold hover:underline"
                  style={{ color: "#045a03" }}
                >
                  Sign Up
                </Link>
              </p>
            </>
          )}

          {step === "method-choice" && renderMethodChoice()}
          {step === "totp-setup" && renderTotpForm(true)}
          {step === "totp-verify" && renderTotpForm(false)}
        </div>
      </section>

      {/* ======================================================================
          OTP Modal — email/SMS code entry (step === "otp-verify")
      ====================================================================== */}
      <OTPModal
        isOpen={step === "otp-verify"}
        email={otpDestination}
        onClose={() => setStep("method-choice")}
        onVerified={() => { /* completeLogin() already navigated away inside handleVerifyOTP */ }}
        onMaxAttemptsReached={() => {
          setStep("credentials");
          setPassword("");
          toast.error("Too many verification attempts. Please sign in again.");
        }}
        onRequestOTP={async () => {
          const method = otpDestination === email ? "email" : "sms";
          await authClient.twoFactor.sendOtp({}, { headers: { "x-2fa-channel": method } });
        }}
        onVerifyOTP={handleVerifyOTP}
      />
    </main>
  );
}
