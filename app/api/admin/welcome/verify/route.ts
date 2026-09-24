/**
 * POST /api/admin/welcome/verify
 *
 * Consumes the one-time token minted by /api/admin/welcome/start. Called
 * once, on mount, by /admin/welcome. Atomically getdel's the Redis key —
 * a second call with the same token (a bookmarked/reused/pasted-into-a-new-tab
 * URL) always fails, which is what makes the page unreachable by changing
 * the URL. The caller already has a real session at this point (see
 * start/route.ts's header comment) — this only additionally proves *this
 * page view is a direct continuation of a login that just happened*, not a
 * revisit, so a mismatch/missing/expired token is never treated as an auth
 * failure: the page just skips straight to /admin instead of erroring.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : null;
    if (!token) return ok({ valid: false });

    const userId = await getRedis().getdel(`admin_welcome:${token}`);
    const valid = typeof userId === "string" && userId === session.user.id;

    return ok({ valid });
  } catch (e) {
    console.error("[admin/welcome/verify] POST error", e);
    reportError(e, { route: "POST /api/admin/welcome/verify" });
    // Fail closed on the salutation (skip it), never fail closed on the
    // admin's actual access — the caller already has a real session.
    return ok({ valid: false });
  }
}
