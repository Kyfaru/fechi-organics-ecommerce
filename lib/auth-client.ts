/**
 * Better Auth — browser/client-side instance.
 *
 * Import this (not lib/auth.ts) from client components and actions that run
 * in the browser. It only exposes safe, public-facing auth methods.
 *
 * The emailOTPClient plugin adds authClient.emailOtp.* methods that mirror
 * the emailOTP server plugin registered in lib/auth.ts.
 */

"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient, adminClient, twoFactorClient } from "better-auth/client/plugins";
import { ac, roles } from "@/lib/permissions";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [
    emailOTPClient(),
    // Adds authClient.admin.* methods (user management, role assignment).
    // ac/roles must match lib/auth.ts's admin() plugin config, otherwise
    // client-side checkRolePermission() silently checks against Better
    // Auth's built-in default roles instead of the app's real ones.
    adminClient({ ac, roles }),
    // Adds authClient.twoFactor.* methods (enable, verifyTotp, disable).
    twoFactorClient(),
  ],
});

// Named exports for convenience so call-sites don't have to destructure.
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;

// ---------------------------------------------------------------------------
// Typed wrapper for signUp.email that includes the additionalFields declared
// in lib/auth.ts (user.additionalFields). Better Auth v1.6.14 doesn't expose
// client-side types for additionalFields, so we declare them explicitly here
// and cast internally rather than scattering @ts-expect-error at every call.
// ---------------------------------------------------------------------------
export interface SignUpProfileData {
  name: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  city?: string;
}

export function signUpWithProfile(data: SignUpProfileData) {
  return authClient.signUp.email(
    data as Parameters<typeof authClient.signUp.email>[0]
  );
}
