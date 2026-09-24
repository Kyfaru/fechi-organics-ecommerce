/**
 * POST /api/admin/welcome/start
 *
 * Mints a short-lived, single-use, opaque token authorizing exactly one
 * view of /admin/welcome — the post-login salutation screen that preloads
 * the rest of the admin panel in the background. Called the instant 2FA
 * verification succeeds (see app/admin/login/page.tsx's finishLogin), by
 * which point a real session already exists (Better Auth mints it inside
 * verifyTotp/verifyOtp, or signIn.email() itself for a brand-new admin —
 * strictly before this ever runs).
 *
 * Deliberately the same shape as the forgot-password flow's `resetAuth`
 * (app/api/auth/forgot-password/verify/route.ts): opaque random value,
 * Redis TTL, consumed exactly once via getdel — not a JWT/self-contained
 * encrypted token, since those can't be revoked without keeping the same
 * server-side state anyway. This is what makes /admin/welcome unreachable
 * by guessing or replaying a URL.
 */

import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";

const WELCOME_TOKEN_TTL_SECONDS = 120;

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    // A forced password change takes priority over the salutation entirely
    // — the login page routes straight to its own password-change step
    // instead of ever requesting a token.
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { mustChangePassword: true },
    });
    if (user?.mustChangePassword) return ok({ mustChangePassword: true });

    const token = randomBytes(32).toString("base64url");
    await getRedis().set(`admin_welcome:${token}`, session.user.id, { ex: WELCOME_TOKEN_TTL_SECONDS });

    return ok({ mustChangePassword: false, token });
  } catch (e) {
    console.error("[admin/welcome/start] POST error", e);
    reportError(e, { route: "POST /api/admin/welcome/start" });
    return Err.internal();
  }
}
