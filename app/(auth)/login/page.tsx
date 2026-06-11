"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams} from "next/navigation";
import AuthToggle from "@/components/auth/AuthToggle";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import OTPModal from "@/components/auth/OTPModal";
import { authClient, signOut } from "@/lib/auth-client";
import { storeUser } from "@/lib/user-store";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";

interface LoginErrors {
  email?: string;
  password?: string;
  general?: string;
}

// Isolated component so useSearchParams is inside a Suspense boundary
function LoginSearchParamsReader({
  onMsg,
}: {
  onMsg: (isAdminPortalMsg: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const isAdminPortalMsg = searchParams.get("msg") === "use-admin-portal";
  // Call the setter on every render so the parent stays in sync
  onMsg(isAdminPortalMsg);
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [isAdminPortalMsg, setIsAdminPortalMsg] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  // OTP modal state
  const [showOTP, setShowOTP] = useState(false);

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
      // Send the OTP to the user's email before showing the modal.
      // The actual signIn.email call happens inside onVerifyOTP after the code
      // is confirmed, so the session cookie is only set on a verified login.
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      setShowOTP(true);
    } catch {
      setErrors({ general: "Failed to send verification code. Please try again." });
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
      await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    } catch {
      setErrors({ general: "Google sign-in failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFacebookSignIn() {
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider: "facebook", callbackURL: "/" });
    } catch {
      setErrors({ general: "Facebook sign-in failed. Please try again." });
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

        // Admin accounts must use the dedicated admin portal.
        // Sign them out here and redirect rather than letting them land on /.
        if (u.role === "admin") {
          await signOut();
          router.push("/admin/login?msg=use-admin-portal");
          return { success: true };
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
        <LoginSearchParamsReader onMsg={setIsAdminPortalMsg} />
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
      <section className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-md">

          {/* Toggle */}
          <div className="flex justify-center mb-10">
            <AuthToggle active="login" />
          </div>

          {/* Heading */}
          <div className="mb-8 text-center">
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#1a1c1c] mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              Welcome Back
            </h2>
            <p className="text-sm text-[#40493c]">
              Sign in to your Fechi Organics account
            </p>
          </div>

          {/* Admin-portal redirect banner */}
          {isAdminPortalMsg && (
            <div
              role="status"
              className="mb-5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700"
            >
              Admin accounts must sign in at the{" "}
              <Link href="/admin/login" className="font-semibold underline">
                admin portal
              </Link>
              .
            </div>
          )}

          {/* General error banner */}
          {errors.general && (
            <div
              role="alert"
              className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600"
            >
              {errors.general}
            </div>
          )}

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
            <div className="flex-1 h-px bg-[#c0cab8]" />
            <span className="px-3 text-xs text-[#40493c]">or continue with</span>
            <div className="flex-1 h-px bg-[#c0cab8]" />
          </div>

          {/* Social */}
          <SocialAuthButtons
            onGoogleClick={handleGoogleSignIn}
            onFacebookClick={handleFacebookSignIn}
            isLoading={isLoading}
          />

          {/* Footer */}
          <p className="text-center text-sm text-[#40493c] mt-8">
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
          setErrors({
            general:
              "Too many verification attempts. Please try again.",
          });
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
