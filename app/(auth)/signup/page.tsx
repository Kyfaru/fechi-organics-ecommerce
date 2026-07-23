"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@iconify/react";
import type { Value as PhoneValue } from "react-phone-number-input";
import AuthToggle from "@/components/auth/AuthToggle";
import FormInput from "@/components/auth/FormInput";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordChecklist, { checkRequirements } from "@/components/auth/PasswordChecklist";
import PhoneInput from "@/components/auth/PhoneInput";
import CountrySelect from "@/components/auth/CountrySelect";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import { authClient, signUpWithProfile, useSession } from "@/lib/auth-client";
import { storeUser } from "@/lib/user-store";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { SignupLoader } from "@/components/ui/signup-loader";
import { posthog } from "@/lib/posthog";

// Isolated component so useSearchParams is inside a Suspense boundary.
// Better Auth redirects OAuth errors (e.g. a banned user) back here as
// ?error=CODE&error_description=... instead of its own bare error page —
// show it as a toast rather than leaving the raw query string on screen.
function SignupSearchParamsReader() {
  const searchParams = useSearchParams();

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

interface SignupErrors {
  firstName?: string;
  lastName?: string;
  country?: string;
  city?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
}

export default function SignupPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<PhoneValue | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showSignupLoader, setShowSignupLoader] = useState(false);

  // PasswordChecklist visibility — show once the password field receives focus
  const [passwordFocused, setPasswordFocused] = useState(false);
  // Track whether the form has been submitted (so checklist shows red X on unmet reqs)
  const [submitted, setSubmitted] = useState(false);

  const { data: sessionData, isPending: sessionPending } = useSession();

  // ---------------------------------------------------------------------------
  // On mount: an already-correct client session skips straight to /. A
  // session for the wrong portal (an admin's) is signed out silently — this
  // only replaces the convenience redirect proxy.ts used to provide; it
  // overlaps intentionally with the app-wide PortalSessionGuard.
  //
  // Reads the shared useSession() hook rather than calling getSession()
  // imperatively — see app/providers.tsx's PortalSessionGuard for why.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (sessionPending || !sessionData?.session) return;
    const role = (sessionData.user as { role?: string } | undefined)?.role;
    if (role === "admin") {
      authClient.signOut();
    } else {
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPending, sessionData]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function validate(): SignupErrors {
    const errs: SignupErrors = {};

    if (!firstName.trim()) errs.firstName = "First name is required.";
    if (!lastName.trim()) errs.lastName = "Last name is required.";
    if (!country) errs.country = "Please select your country.";
    if (!city.trim()) errs.city = "City is required.";

    if (!email.trim()) errs.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email address.";

    if (!password) {
      errs.password = "Password is required.";
    } else if (!checkRequirements(password).every((r) => r.met)) {
      // All 4 checklist requirements must be satisfied
      errs.password = "Password does not meet all requirements.";
    }

    if (!confirmPassword) errs.confirmPassword = "Please confirm your password.";
    else if (confirmPassword !== password)
      errs.confirmPassword = "Passwords do not match.";

    if (!acceptedTerms)
      errs.terms = "You must accept the Terms of Service to continue.";

    return errs;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // Mark as submitted so PasswordChecklist shows red X for unmet requirements
      if (validationErrors.password) {
        setSubmitted(true);
        // Ensure checklist is visible even if the field wasn't focused before
        setPasswordFocused(true);
      }
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const result = await signUpWithProfile({
        name: `${firstName.trim()} ${lastName.trim()}`,
        email,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone ?? "",
        country,
        city: city.trim(),
      });

      if (result.error) {
        const code = result.error.code ?? "";
        if (code === "USER_ALREADY_EXISTS" || code === "EMAIL_TAKEN") {
          setErrors({ email: "An account with this email already exists." });
        } else {
          toast.error(result.error.message ?? "Sign up failed. Please try again.");
        }
        return;
      }

      // Cache the newly created user profile for quick client-side access
      if (result?.data?.user) {
        const u = result.data.user as Record<string, unknown>;
        storeUser({
          id: u.id as string,
          name: u.name as string,
          email: u.email as string,
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          companyId: (u.companyId as string | null) ?? null, // set by DB trigger
          image: (u.image as string | null) ?? null,
        });
        posthog.identify(u.id as string, {
          email: u.email as string,
          name: u.name as string,
        });
        posthog.capture("signup_completed", { method: "email_password" });
      }

      // Successful signup — show animated loader then redirect
      setShowSignupLoader(true);
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Social handlers
  // ---------------------------------------------------------------------------
  async function handleGoogleSignIn() {
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/signup" });
    } catch {
      toast.error("Google sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFacebookSignIn() {
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider: "facebook", callbackURL: "/", errorCallbackURL: "/signup" });
    } catch {
      toast.error("Facebook sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="flex min-h-screen">
      <Suspense fallback={null}>
        <SignupSearchParamsReader />
      </Suspense>
      {/* ====================================================================
          LEFT PANEL — deep green botanical
      ==================================================================== */}
      <aside
        className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col items-start justify-end p-12 overflow-hidden"
        style={{
          backgroundImage: "linear-gradient(rgba(39,115,30,0.75), rgba(39,115,30,0.75)), url('/img/lush-forest-background-2.png')",
    backgroundSize: "initial",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
        }}
        aria-hidden="true"
      >
        {/* Botanical gradient layers */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 25% 15%, rgba(164,246,144,0.18) 0%, transparent 55%), " +
              "radial-gradient(ellipse at 75% 80%, rgba(4,90,3,0.6) 0%, transparent 50%), " +
              "radial-gradient(ellipse at 50% 50%, rgba(39,115,30,0.3) 0%, transparent 70%)",
          }}
        />

        {/* Leaf decorative shapes */}
        <div
          className="absolute top-8 right-4 w-64 h-80 opacity-25 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 55% 35%, #a4f690 0%, transparent 65%)",
            transform: "rotate(20deg) translate(15%, -5%)",
            borderRadius: "55% 45% 65% 35% / 45% 55% 55% 45%",
          }}
        />
        <div
          className="absolute top-1/3 left-0 w-56 h-72 opacity-15 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 45% 55%, #a4f690 0%, transparent 65%)",
            transform: "rotate(-15deg) translateX(-20%)",
            borderRadius: "45% 55% 35% 65% / 55% 45% 65% 35%",
          }}
        />

        {/* Text content */}
        <div className="relative z-10 max-w-sm">
          <p
            className="text-[#a4f690] text-xs tracking-[0.3em] uppercase font-semibold mb-3"
            style={{ fontFamily: "var(--font-stagnan), sans-serif" }}
          >
            Truly Organic
          </p>
          <h1
            className="text-white text-5xl xl:text-6xl leading-tight mb-4"
            style={{ fontFamily: "var(--font-vastago), serif", fontWeight: 700 }}
          >
            Grown with
            <br />
            Intention.
          </h1>
          <p
            className="text-white/75 text-base"
            style={{ fontFamily: "var(--font-stagnan), sans-serif" }}
          >
            From certified farms to your table —
            <br />
            no shortcuts, no compromises.
          </p>
        </div>

        <p
          className="relative z-10 mt-6 text-white/40 text-xs tracking-widest uppercase"
          style={{ fontFamily: "var(--font-stagnan), sans-serif" }}
        >
          Fechi Organics
        </p>
      </aside>

      {/* ====================================================================
          RIGHT PANEL — light gray form area
      ==================================================================== */}
      <section
        className="flex-1 flex items-center justify-center px-6 py-12 overflow-y-auto bg-[#f9f9f9] dark:bg-gray-950"
      >
        <div className="w-full max-w-lg sm:max-w-xl">

          {/* Back to home */}
          <div className="mb-4">
            <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] text-[#40493c] dark:text-gray-400 hover:text-[#27731e] dark:hover:text-[#27731e] transition-colors">
              <Icon icon="mdi:arrow-left" width={18} />
              Back to home
            </Link>
          </div>

          {/* Toggle */}
          <div className="flex justify-center mb-10">
            <AuthToggle active="signup" />
          </div>

          {/* Heading */}
          <div className="mb-8 sm:text-left text-center">
            <h2
              className="text-3xl sm:text-4xl font-bold text-[#1a1c1c] dark:text-white mb-2"
              style={{ fontFamily: "var(--font-vastago), sans-serif" }}
            >
              Create an Account
            </h2>
            <p className="text-sm text-[#40493c] dark:text-gray-400">
              Join Fechi Organics and start your organic journey
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            {/* Row 1: First / Last name */}
            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label="First Name"
                type="text"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (errors.firstName) setErrors((p) => ({ ...p, firstName: undefined }));
                }}
                error={errors.firstName}
                autoComplete="given-name"
                disabled={isLoading}
              />
              <FormInput
                label="Last Name"
                type="text"
                placeholder="Smith"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (errors.lastName) setErrors((p) => ({ ...p, lastName: undefined }));
                }}
                error={errors.lastName}
                autoComplete="family-name"
                disabled={isLoading}
              />
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                }}
                error={errors.email}
                autoComplete="email"
                disabled={isLoading}
              />
              <PhoneInput
                label="Phone Number"
                value={phone}
                onChange={(v) => {
                  setPhone(v);
                  if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                }}
                error={errors.phone}
              />
            </div>

            {/* Country / City */}
            <div className="grid grid-cols-2 gap-4">
              <CountrySelect
                label="Country"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  if (errors.country) setErrors((p) => ({ ...p, country: undefined }));
                }}
                error={errors.country}
                disabled={isLoading}
              />
              <FormInput
                label="City"
                type="text"
                placeholder="New York"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  if (errors.city) setErrors((p) => ({ ...p, city: undefined }));
                }}
                error={errors.city}
                autoComplete="address-level2"
                disabled={isLoading}
              />
            </div>

            {/* Password / Confirm — password field shows the checklist on focus */}
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="flex flex-col">
                <PasswordInput
                  label="Password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                    // Reset submitted state when user edits the password
                    if (submitted) setSubmitted(false);
                  }}
                  onFocus={() => setPasswordFocused(true)}
                  error={errors.password}
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                {/*
                  Password requirements checklist.
                  Shown once the field has been focused; shows red X for unmet
                  requirements after a failed form submission.
                */}
                <PasswordChecklist
                  password={password}
                  visible={passwordFocused}
                  submitted={submitted}
                />
              </div>
              <PasswordInput
                label="Confirm Password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword)
                    setErrors((p) => ({ ...p, confirmPassword: undefined }));
                }}
                error={errors.confirmPassword}
                autoComplete="new-password"
                disabled={isLoading}
              />
            </div>

            {/* Terms */}
            <div className="flex flex-col gap-1">
              <label className="flex items-start gap-3 cursor-pointer select-none pl-5">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    if (errors.terms) setErrors((p) => ({ ...p, terms: undefined }));
                  }}
                  disabled={isLoading}
                  className="mt-0.5 w-4 h-4 accent-[#27731e] cursor-pointer"
                />
                <span className="text-xs text-[#40493c] dark:text-gray-400 leading-relaxed">
                  I agree to the{" "}
                  <Link
                    href="/terms"
                    className="font-semibold underline hover:text-[#27731e]"
                    style={{ color: "#045a03" }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="font-semibold underline hover:text-[#27731e]"
                    style={{ color: "#045a03" }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {errors.terms && (
                <p className="text-xs text-red-500 ml-7">{errors.terms}</p>
              )}
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-full font-bold text-sm tracking-wide text-[#1a1c1c] transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              style={{ backgroundColor: "#fec700" }}
            >
              {isLoading ? <Spinner size={16} invert /> : "Sign Up"}
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
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold hover:underline"
              style={{ color: "#045a03" }}
            >
              Log In
            </Link>
          </p>
        </div>
      </section>

      {showSignupLoader && (
        <SignupLoader onDone={() => router.push("/")} />
      )}
    </main>
  );
}
