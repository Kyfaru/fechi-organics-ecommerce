/**
 * GET /api/account/2fa/status — the signed-in customer's 2FA configuration.
 * Used by the login method-choice screen for a brand-new account (mirrors
 * GET /api/admin/me's role in the admin login flow) — called once a real
 * session exists post-signIn.email(), before 2FA has ever been set up.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true, twoFaEmail: true, twoFaPhone: true, twoFactorEnabled: true },
    });
    if (!user) return Err.notFound("User");

    return ok(user);
  } catch (e) {
    console.error("[account/2fa/status] GET error", e);
    reportError(e, { route: "GET /api/account/2fa/status", tags: { flow: "account-2fa" } });
    return Err.internal();
  }
}
