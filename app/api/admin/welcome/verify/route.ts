/**
 * POST /api/admin/welcome/verify
 *
 * Consumes the one-time token minted by /api/admin/welcome/start. Called
 * once, on mount, by /admin/welcome. Atomically getdel's the Redis key —
 * a second call with the same token (a bookmarked/reused/pasted-into-a-new-tab
 * URL) always fails, which is what makes the page unreachable by changing
 * the URL.
 *
 * Deliberately does NOT also re-check the caller's session here. The token
 * itself is already sufficient proof — unguessable, minted only for a real
 * userId, single-use — exactly the trust model this codebase already uses
 * for the password-reset flow's `resetAuth` token
 * (app/api/auth/reset-password/route.ts), which doesn't cross-check session
 * either. An earlier version of this route did add that extra check, which
 * only introduced a second chance to lose the same session-cookie-
 * propagation race that /admin/welcome was seeing intermittent failures
 * from (the session Better Auth just minted inside verifyOtp/verifyTotp
 * hadn't always finished propagating by the time this ran moments later).
 */

import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";
import { ok } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : null;
    if (!token) return ok({ valid: false });

    const userId = await getRedis().getdel(`admin_welcome:${token}`);
    return ok({ valid: typeof userId === "string" });
  } catch (e) {
    console.error("[admin/welcome/verify] POST error", e);
    reportError(e, { route: "POST /api/admin/welcome/verify" });
    // Fail closed on the salutation (skip it), never fail closed on the
    // admin's actual access — a real session already exists regardless.
    return ok({ valid: false });
  }
}
