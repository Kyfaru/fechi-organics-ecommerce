/**
 * POST /api/admin/otp/send
 * Generates a 6-digit OTP and delivers it via email or SMS for non-TOTP 2FA.
 *
 * Rate limit: 3 sends per 10 minutes per userId.
 * OTP expires in 10 minutes.
 * Requires the user to have authenticated (signed in) first — the session must exist.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { sendOTPEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireStaffSession } from "@/lib/require-permission";
import { generateOtp, storeOtp } from "@/lib/otp";
import { getRedis } from "@/lib/redis";
import { makeRatelimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

const ratelimit = makeRatelimit(Ratelimit.slidingWindow(3, "10 m"), "admin_2fa_otp_send");
const OTP_TTL_SECONDS = 10 * 60;

const BodySchema = z.object({
  userId: z.string(),
  method: z.enum(["email", "sms"]),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { userId, method } = parsed.data;

    // Only allow the authenticated user to trigger their own OTP
    if (userId !== session.user.id) return Err.forbidden();

    const denied = await requireStaffSession(req);
    if (denied) return denied;

    if (ratelimit) {
      const { success } = await ratelimit.limit(userId);
      if (!success) return Err.rateLimited();
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, phoneCode: true },
    });
    if (!user) return Err.forbidden();

    const otp = generateOtp();
    // Redis-backed (not an in-memory Map — see lib/otp.ts's doc comment for
    // why: this route runs on serverless instances where /send and /verify
    // can land on different processes, so anything in-memory silently loses
    // every OTP and every code comes back "invalid" regardless of correctness).
    // One active code per user regardless of channel — picking a method and
    // resending replaces whichever code was pending.
    await storeOtp(`admin:2fa:otp:${userId}`, otp, OTP_TTL_SECONDS);
    // Fresh code = fresh attempt budget.
    await getRedis().del(`admin:2fa:otp:attempts:${userId}`);

    if (method === "email") {
      if (!user.email) return Err.validation("No email address on file");
      await sendOTPEmail(user.email, otp, "sign-in");
      console.info("[admin/otp/send] OTP sent via email to admin", userId);
    } else {
      const phone = user.phone ? combineLegacyPhone(user.phone, user.phoneCode) : null;
      if (!phone) return Err.validation("No phone number on file");
      await sendSms(phone, `Your Fechi Organics admin login code: ${otp}. Valid for 10 minutes.`);
      console.info("[admin/otp/send] OTP sent via SMS to admin", userId);
    }

    return ok({ sent: true });
  } catch (e) {
    console.error("[admin/otp/send] POST error", e);
    reportError(e, { route: "POST /api/admin/otp/send", tags: { flow: "admin-2fa-otp" } });
    return Err.internal();
  }
}
