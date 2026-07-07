import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateOtp, storeOtp } from "@/lib/otp";
import { getRedis } from "@/lib/redis";
import { sendOTPEmail } from "@/lib/email";
import { Ratelimit } from "@upstash/ratelimit";
import { makeRatelimit } from "@/lib/ratelimit";

// Separate prefix from the customer flow's 'pwreset_send' — admin and
// customer resend attempts are tracked in independent buckets. 6 = 1 initial
// send + 5 allowed resend clicks (see app/admin/forgot-password/page.tsx).
const ratelimit = makeRatelimit(Ratelimit.slidingWindow(6, "10 m"), "admin_pwreset_send");

const OTP_TTL_SECONDS = 5 * 60;

/**
 * POST /api/admin/forgot-password
 *
 * Mirrors /api/auth/forgot-password for admin self-service password reset.
 * Email-only (no phone channel — the admin login flow has never supported
 * phone, and nothing here asked for it). Always returns 200 to prevent
 * account enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body as { email?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: true });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (ratelimit) {
      const { success } = await ratelimit.limit(normalizedEmail);
      if (!success) return NextResponse.json({ ok: true }); // Silent throttle
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true },
    });

    // Only admins get a code from this endpoint — non-admins use /api/auth/forgot-password.
    if (user && user.role === "admin") {
      const otp = generateOtp();
      await storeOtp(`admin:pwreset:otp:email:${user.id}`, otp, OTP_TTL_SECONDS);
      // Fresh code = fresh 5-guess budget (see verify route's attempt counter).
      await getRedis().del(`admin:pwreset:otp:attempts:email:${user.id}`);
      await sendOTPEmail(user.email, otp, "password-reset");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/forgot-password]", err);
    return NextResponse.json({ ok: true });
  }
}
