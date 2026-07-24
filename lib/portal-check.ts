"use client";

/**
 * Client-side precheck before hitting Better Auth's sign-in/OTP-send
 * endpoints. Fails open in every failure mode (network error, non-JSON
 * response, etc.) — this is a UX optimization to avoid creating a session or
 * sending an OTP for an account that belongs to the other portal; the real
 * enforcement is the existing post-auth role check each login page keeps.
 */
export async function checkPortalMatch(
  email: string,
  portal: "admin" | "client",
): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/portal-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, portal }),
    });
    const json = await res.json().catch(() => ({ ok: true }));
    return json?.ok !== false;
  } catch {
    return true;
  }
}
