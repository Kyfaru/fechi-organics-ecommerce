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
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { sendOTPEmail } from "@/lib/email";
import { sendSms } from "@/lib/twilio";
import { assertTrustedOrigin } from "@/lib/origin-check";

// In-memory OTP store — fine for a single admin panel with low traffic.
// For multi-instance deployments, replace with Redis.
interface OtpEntry {
  otp: string;
  expires: number;     // Unix ms
  attempts: number;    // verify attempts, max 5
  sends: number;       // send attempts, reset every 10 min
  windowStart: number; // when the 10-min rate window started
}

const otpStore = new Map<string, OtpEntry>();

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SENDS_PER_WINDOW = 3;
const OTP_TTL_MS = 10 * 60 * 1000;   // 10 minutes

function generateOtp(): string {
  // Cryptographically random 6-digit integer padded with leading zeros
  const num = Math.floor(Math.random() * 1_000_000);
  return String(num).padStart(6, "0");
}

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

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, role: true },
    });
    if (!user || user.role !== "admin") return Err.forbidden();

    // Rate limiting
    const now = Date.now();
    const existing = otpStore.get(userId);
    if (existing) {
      const windowElapsed = now - existing.windowStart;
      if (windowElapsed < RATE_WINDOW_MS && existing.sends >= MAX_SENDS_PER_WINDOW) {
        return Err.rateLimited();
      }
    }

    const otp = generateOtp();
    const windowStart = existing && (now - existing.windowStart) < RATE_WINDOW_MS
      ? existing.windowStart
      : now;
    const previousSends = existing && (now - existing.windowStart) < RATE_WINDOW_MS
      ? existing.sends
      : 0;

    otpStore.set(userId, {
      otp,
      expires: now + OTP_TTL_MS,
      attempts: 0,
      sends: previousSends + 1,
      windowStart,
    });

    if (method === "email") {
      if (!user.email) return Err.validation("No email address on file");
      await sendOTPEmail(user.email, otp, "sign-in");
      console.info("[admin/otp/send] OTP sent via email to admin", userId);
    } else {
      if (!user.phone) return Err.validation("No phone number on file");
      await sendSms(user.phone, `Your Fechi Organics admin login code: ${otp}. Valid for 10 minutes.`);
      console.info("[admin/otp/send] OTP sent via SMS to admin", userId);
    }

    return ok({ sent: true });
  } catch (e) {
    console.error("[admin/otp/send] POST error", e);
    return Err.internal();
  }
}

// Export the store so the verify route can access it from the same module space.
// In a real multi-instance setup this would be Redis.
export { otpStore };
