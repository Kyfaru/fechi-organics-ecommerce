import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Ratelimit } from "@upstash/ratelimit";
import { makeRatelimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

// Same "always 200, never reveal account existence via status/shape"
// posture as app/api/auth/forgot-password/route.ts — but this one does
// return a few booleans (hasPhone, twoFaEmail, twoFaPhone), needed by the
// login/admin-login method-choice screen to decide which OTP cards to
// offer a RETURNING user (2FA already configured) before any real session
// exists to check their profile directly. See LoginForm.tsx /
// app/admin/login/page.tsx's renderMethodChoice — the new-user setup path
// already has this via accountStatus (a real session), this route only
// covers the returning-user gap.
//
// twoFaEmail/twoFaPhone are additive fields — app/admin/login/page.tsx
// gates its Email/SMS cards on them; LoginForm.tsx (customer) keeps
// reading only hasPhone, unaffected.
const ratelimit = makeRatelimit(Ratelimit.slidingWindow(20, "10 m"), "twofa_precheck");

// Genuinely-checked "nothing on file" — safe to answer strictly for
// malformed input or a real DB error.
const EMPTY_RESULT = { hasPhone: false, twoFaEmail: false, twoFaPhone: false };
// Rate-limited: we didn't actually check. The channel gate this feeds is
// only a UI hint (which cards to render) — the real enforcement happens at
// send time (lib/auth.ts's sendOTP reads the DB directly and falls back to
// email if a channel isn't really available) — so there's no security cost
// to answering permissively here; only the enumeration-prevention purpose
// of the rate limit itself needs to hold, which it still does.
const UNKNOWN_RESULT = { hasPhone: true, twoFaEmail: true, twoFaPhone: true };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body as { email?: string };
    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: true, data: EMPTY_RESULT });
    }

    const normalized = email.toLowerCase().trim();

    if (ratelimit) {
      const { success } = await ratelimit.limit(normalized);
      if (!success) return NextResponse.json({ ok: true, data: UNKNOWN_RESULT });
    }

    const user = await db.user.findUnique({
      where: { email: normalized },
      select: { phone: true, twoFaEmail: true, twoFaPhone: true },
    });
    return NextResponse.json({
      ok: true,
      data: {
        hasPhone: !!user?.phone,
        twoFaEmail: user?.twoFaEmail ?? false,
        twoFaPhone: user?.twoFaPhone ?? false,
      },
    });
  } catch (err) {
    reportError(err, { route: "POST /api/account/2fa/precheck" });
    return NextResponse.json({ ok: true, data: EMPTY_RESULT });
  }
}
