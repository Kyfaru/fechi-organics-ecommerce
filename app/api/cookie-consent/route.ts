import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { CONSENT_COOKIE, CONSENT_GUEST_COOKIE, CONSENT_COOKIE_MAX_AGE } from "@/lib/cookie-consent";
import { Err } from "@/lib/api";
import { reportError } from "@/lib/observability";

/** Records the visitor's cookie-consent acceptance. Reject is a pure
 * client-side dismiss and never calls this route. */
export async function POST(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;

    const consentToken = encrypt(randomUUID());

    let guestToken: string | null = null;
    if (userId) {
      await db.cookieConsent.upsert({
        where: { userId },
        update: { consentToken },
        create: { userId, consentToken },
      });
    } else {
      guestToken = req.cookies.get(CONSENT_GUEST_COOKIE)?.value ?? randomUUID();
      await db.cookieConsent.upsert({
        where: { token: guestToken },
        update: { consentToken },
        create: { token: guestToken, consentToken },
      });
    }

    const resp = NextResponse.json({ ok: true });
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: CONSENT_COOKIE_MAX_AGE,
    };
    resp.cookies.set(CONSENT_COOKIE, "1", cookieOptions);
    if (guestToken) resp.cookies.set(CONSENT_GUEST_COOKIE, guestToken, cookieOptions);
    return resp;
  } catch (e) {
    console.error("[cookie-consent] POST error", e);
    reportError(e, { route: "POST /api/cookie-consent" });
    return Err.internal();
  }
}
