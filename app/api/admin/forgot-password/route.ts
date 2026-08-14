import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateOtp, storeOtp } from "@/lib/otp";
import { getRedis } from "@/lib/redis";
import { sendOTPEmail } from "@/lib/email";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { Ratelimit } from "@upstash/ratelimit";
import { makeRatelimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

// Separate prefix from the customer flow's 'pwreset_send' — admin and
// customer resend attempts are tracked in independent buckets. 6 = 1 initial
// send + 5 allowed resend clicks (see app/admin/forgot-password/page.tsx).
const ratelimit = makeRatelimit(Ratelimit.slidingWindow(6, "10 m"), "admin_pwreset_send");

const OTP_TTL_SECONDS = 5 * 60;

/**
 * POST /api/admin/forgot-password
 *
 * Mirrors /api/auth/forgot-password for admin self-service password reset,
 * with one difference: the code always goes out on every channel the admin
 * has available (email, plus SMS if they have a phone on file), not just
 * one. `channel` only controls dispatch order — it's sent first, the rest
 * follow — so a slow/undelivered SMS never blocks the email arriving.
 * Always returns 200 to prevent account enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, channel } = body as { email?: string; channel?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: true });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const preferredChannel = channel === "sms" ? "sms" : "email";

    if (ratelimit) {
      const { success } = await ratelimit.limit(normalizedEmail);
      if (!success) return NextResponse.json({ ok: true }); // Silent throttle
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true, phone: true, phoneCode: true },
    });

    // Only admins get a code from this endpoint — non-admins use /api/auth/forgot-password.
    if (user && user.role === "admin") {
      const otp = generateOtp();
      await storeOtp(`admin:pwreset:otp:${user.id}`, otp, OTP_TTL_SECONDS);
      // Fresh code = fresh 5-guess budget (see verify route's attempt counter).
      await getRedis().del(`admin:pwreset:otp:attempts:${user.id}`);

      const phone = user.phone ? combineLegacyPhone(user.phone, user.phoneCode) : null;
      const smsUsable = !!phone && hasSmsConfig();

      const channels: Array<"email" | "sms"> = smsUsable ? ["email", "sms"] : ["email"];
      channels.sort((a, b) => (a === preferredChannel ? -1 : b === preferredChannel ? 1 : 0));

      for (const c of channels) {
        if (c === "email") {
          await sendOTPEmail(user.email, otp, "password-reset");
        } else if (phone) {
          await sendSms(phone, `Your Fechi Organics admin password reset code: ${otp}. Expires in 5 minutes.`);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/forgot-password]", err);
    reportError(err, { route: "POST /api/admin/forgot-password", tags: { flow: "admin-forgot-password" } });
    return NextResponse.json({ ok: true });
  }
}
