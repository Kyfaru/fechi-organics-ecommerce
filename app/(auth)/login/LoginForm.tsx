"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@iconify/react";
import AuthToggle from "@/components/auth/AuthToggle";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import OTPModal from "@/components/auth/OTPModal";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import { storeUser } from "@/lib/user-store";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { posthog } from "@/lib/posthog";
import { checkPortalMatch } from "@/lib/portal-check";

interface LoginErrors {
  email?: string;
  password?: string;
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
  // OTP modal state
  const [showOTP, setShowOTP] = useState(false);

  const { data: sessionData, isPending: sessionPending } = useSession();

  // ---------------------------------------------------------------------------
  // On mount: an already-correct client session skips straight to /. A
  // session for the wrong portal (an admin's) is signed out silently — this
  // overlaps with the app-wide PortalSessionGuard (app/providers.tsx), which
  // is intentional defense-in-depth now that proxy.ts no longer blindly
  // redirects any session-cookie holder away from this page.
  //
  // Reads the shared useSession() hook rather than calling getSession()
  // imperatively — see app/providers.tsx's PortalSessionGuard for why.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (sessionPending || !sessionData?.session) return;
    const role = (sessionData.user as { role?: string } | undefined)?.role;
    if (role === "admin") {
      signOut();
    } else {
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPending, sessionData]);

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

  // ---------------------------------------------------------------------------
  // Submit handler — validates then triggers OTP send, opens modal
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      // Reject an admin's email before ever sending an OTP — no code is
      // emailed and no session is created for a wrong-portal attempt.
      const portalOk = await checkPortalMatch(email, "client");
      if (!portalOk) {
        setErrors({ email: "An account with this email already exists." });
        return;
      }

      // Send the OTP to the user's email before showing the modal.
      // The actual signIn.email call happens inside onVerifyOTP after the code
      // is confirmed, so the session cookie is only set on a verified login.
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      setShowOTP(true);
    } catch {
      toast.error("Failed to send verification code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Social auth handlers
  // ---------------------------------------------------------------------------
  async function handleGoogleSignIn() {
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" });
    } catch {
      toast.error("Google sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFacebookSignIn() {
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider: "facebook", callbackURL: "/", errorCallbackURL: "/login" });
    } catch {
      toast.error("Facebook sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // OTP verification callback
  // Verifies the OTP, then signs the user in and stores their profile.
  // ---------------------------------------------------------------------------
  async function handleVerifyOTP(
    otp: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // POST /sign-in/email-otp — the correct endpoint for "sign-in" type OTPs.
      // verifyEmail hits /email-otp/verify-email which is for "email-verification"
      // type only and will always return INVALID_OTP for sign-in codes.
      const result = await authClient.signIn.emailOtp({ email, otp });
      if (result?.error) {
        return { success: false, error: "Invalid or expired code." };
      }

      if (result?.data?.user) {
        const u = result.data.user as Record<string, unknown>;

        // Admin accounts must use the dedicated admin portal — defense-in-depth
        // fallback in case checkPortalMatch (handleSubmit) was bypassed.
        if (u.role === "admin") {
          await signOut();
          return { success: false, error: "An account with this email already exists." };
        }

        storeUser({
          id: u.id as string,
          name: u.name as string,
          email: u.email as string,
          firstName: (u.firstName as string | null) ?? null,
          lastName: (u.lastName as string | null) ?? null,
          companyId: (u.companyId as string | null) ?? null,
          image: (u.image as string | null) ?? null,
        });
        posthog.identify(u.id as string, {
          email: u.email as string,
          name: u.name as string,
        });
        posthog.capture("login_completed", { method: "email_otp" });
      }

      return { success: true };
    } catch {
      return { success: false, error: "Verification failed. Please try again." };
    }
  }

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

          {/* Toggle */}
          <div className="flex justify-center mb-10">
            <AuthToggle active="login" />
          </div>

          {/* Heading */}
          <div className="mb-8 text-center">
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#1a1c1c] dark:text-white mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              Welcome Back
            </h2>
            <p className="text-sm text-[#40493c] dark:text-gray-400">
              Sign in to your Fechi Organics account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
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

            {/* CTA — submitting triggers OTP send, not direct sign-in */}
            <button
              type="submit"
              disabled={isLoading}
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
        </div>
      </section>

      {/* ======================================================================
          OTP Modal — rendered portal-style at the end of the page tree.
          Shown after the user passes email/password validation and the OTP
          has been sent to their email.
      ====================================================================== */}
      <OTPModal
        isOpen={showOTP}
        email={email}
        onClose={() => setShowOTP(false)}
        onVerified={() => {
          setShowOTP(false);
          toast.success("Welcome back!");
          // User is now authenticated — navigate to the home/dashboard
          router.push("/");
          router.refresh();
        }}
        onMaxAttemptsReached={() => {
          setShowOTP(false);
          toast.error("Too many verification attempts. Please try again.");
        }}
        onRequestOTP={async () => {
          await authClient.emailOtp.sendVerificationOtp({
            email,
            type: "sign-in",
          });
        }}
        onVerifyOTP={handleVerifyOTP}
      />
    </main>
  );
}
