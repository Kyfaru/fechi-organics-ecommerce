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

const EMPTY_RESULT = { hasPhone: false, twoFaEmail: false, twoFaPhone: false };

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
      if (!success) return NextResponse.json({ ok: true, data: EMPTY_RESULT });
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
