import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Ratelimit } from "@upstash/ratelimit";
import { makeRatelimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

// Same "always 200, never reveal account existence via status/shape"
// posture as app/api/auth/forgot-password/route.ts — but this one does
// return one boolean (hasPhone), needed by the login/admin-login
// method-choice screen to hide the SMS OTP card for a RETURNING user
// (2FA already configured) before any real session exists to check their
// profile directly. See LoginForm.tsx / app/admin/login/page.tsx's
// renderMethodChoice — the new-user setup path already has this via
// accountStatus (a real session), this route only covers the returning-user
// gap.
const ratelimit = makeRatelimit(Ratelimit.slidingWindow(20, "10 m"), "twofa_precheck");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body as { email?: string };
    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: true, data: { hasPhone: false } });
    }

    const normalized = email.toLowerCase().trim();

    if (ratelimit) {
      const { success } = await ratelimit.limit(normalized);
      if (!success) return NextResponse.json({ ok: true, data: { hasPhone: false } });
    }

    const user = await db.user.findUnique({ where: { email: normalized }, select: { phone: true } });
    return NextResponse.json({ ok: true, data: { hasPhone: !!user?.phone } });
  } catch (err) {
    reportError(err, { route: "POST /api/account/2fa/precheck" });
    return NextResponse.json({ ok: true, data: { hasPhone: false } });
  }
}
