/**
 * POST /api/admin/logout-ping
 * Records the moment an admin signs out, so the next login can show a
 * "back so soon" greeting when it happens 1-3h later (see /api/admin/me's
 * backSoon calculation). Called right before authClient.signOut() —
 * afterward the session is gone and there's nothing left to attribute
 * this to.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    await db.adminProfile.update({
      where: { userId: session.user.id },
      data: { lastLogoutAt: new Date() },
    });

    return ok({});
  } catch (e) {
    // Best-effort — a missed timestamp only means the next login shows the
    // ordinary "Welcome back" copy instead of "Back so soon," never blocks it.
    console.error("[admin/logout-ping] POST error", e);
    reportError(e, { route: "POST /api/admin/logout-ping" });
    return Err.internal();
  }
}
