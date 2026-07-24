import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { db } from "@/lib/db";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { makeRatelimit } from "@/lib/ratelimit";

const ratelimit = makeRatelimit(Ratelimit.slidingWindow(10, "1 m"), "auth_portal_check");

/**
 * POST /api/auth/portal-check
 *
 * Tells a login page, before it ever calls Better Auth's sign-in, whether an
 * email belongs to the *other* portal (admin vs client) — so a wrong-portal
 * attempt never creates a session or (for the client OTP flow) sends an OTP
 * email in the first place.
 *
 * Fails open in every failure mode (malformed body, rate-limited, DB error):
 * always `{ ok: true }`. This is a UX/abuse-reduction optimization, not the
 * real enforcement boundary — the post-auth role check each login page keeps
 * as a fallback is what actually guards access, so a Redis blip must never
 * block a legitimate sign-in.
 */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    const body = await req.json().catch(() => ({}));
    const { email, portal } = body as { email?: string; portal?: string };

    if (!email || typeof email !== "string" || (portal !== "admin" && portal !== "client")) {
      return NextResponse.json({ ok: true });
    }

    const normalized = email.toLowerCase().trim();

    if (ratelimit) {
      const { success } = await ratelimit.limit(`${portal}:${normalized}`);
      if (!success) return NextResponse.json({ ok: true });
    }

    const user = await db.user.findUnique({
      where: { email: normalized },
      select: { role: true },
    });

    if (!user || user.role === portal) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false });
  } catch (err) {
    console.error("[auth/portal-check]", err);
    return NextResponse.json({ ok: true });
  }
}
