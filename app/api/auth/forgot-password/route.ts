import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateOtp, storeOtp } from "@/lib/otp";
import { getRedis } from "@/lib/redis";
import { sendOTPEmail } from "@/lib/email";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { Ratelimit } from "@upstash/ratelimit";
import { makeRatelimit } from "@/lib/ratelimit";

// 6 sends per 10 minutes per (channel, identifier) — 1 initial send + the
// client's 5 allowed resend clicks (15s/30s/60s/90s/90s backoff, hard cap 5
// resends). Backstops the UI's own timer/cap in case a caller bypasses it.
const ratelimit = makeRatelimit(Ratelimit.slidingWindow(6, "10 m"), "pwreset_send");

// OTP is valid for 5 minutes — matches the "expires in 5 minutes" copy baked
// into the shared OTP email template (lib/email.ts's buildOTPEmailHTML).
const OTP_TTL_SECONDS = 5 * 60;

/**
 * POST /api/auth/forgot-password
 *
 * Accepts an email or phone identifier and, if a matching non-admin user
 * exists, sends a 6-digit OTP via that channel. Always returns 200 to
 * prevent account enumeration — the response is identical whether or not
 * the account exists, or whether the request was silently rate-limited.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { identifier, channel } = body as { identifier?: string; channel?: string };

    if (
      !identifier ||
      typeof identifier !== "string" ||
      (channel !== "email" && channel !== "phone")
    ) {
      // Malformed request — still 200, never reveal validation details to a prober.
      return NextResponse.json({ ok: true });
    }

    const normalized = channel === "email" ? identifier.toLowerCase().trim() : identifier.trim();

    if (ratelimit) {
      const { success } = await ratelimit.limit(`${channel}:${normalized}`);
      if (!success) return NextResponse.json({ ok: true }); // Silent throttle
    }

    const user =
      channel === "email"
        ? await db.user.findUnique({ where: { email: normalized }, select: { id: true, email: true, role: true } })
        : await db.user.findFirst({ where: { phone: normalized }, select: { id: true, phone: true, phoneCode: true, role: true } });

    // Only non-admin users get a code here — admins have their own flow
    // under /admin/forgot-password (app/api/admin/forgot-password).
    if (user && user.role !== "admin") {
      const otp = generateOtp();
      await storeOtp(`pwreset:otp:${channel}:${user.id}`, otp, OTP_TTL_SECONDS);
      // Fresh code = fresh 5-guess budget — otherwise a resend after a couple
      // of wrong tries would inherit the old code's near-exhausted counter.
      await getRedis().del(`pwreset:otp:attempts:${channel}:${user.id}`);

      if (channel === "email") {
        await sendOTPEmail((user as { email: string }).email, otp, "password-reset");
      } else {
        const rawPhone = (user as { phone: string | null; phoneCode: string | null }).phone;
        const phoneCode = (user as { phoneCode: string | null }).phoneCode;
        const phone = rawPhone ? combineLegacyPhone(rawPhone, phoneCode) : null;
        if (phone && hasSmsConfig()) {
          await sendSms(phone, `Your Fechi Organics password reset code: ${otp}. Expires in 5 minutes.`);
        } else if (phone) {
          console.warn("[forgot-password] SMS not configured — OTP:", otp);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    // Never reveal errors — always return 200.
    return NextResponse.json({ ok: true });
  }
}
