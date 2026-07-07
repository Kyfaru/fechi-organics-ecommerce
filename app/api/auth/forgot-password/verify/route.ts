import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyOtp } from "@/lib/otp";
import { getRedis } from "@/lib/redis";
import { randomBytes } from "crypto";

// After 5 wrong guesses the OTP is burned and the user must request a new
// one — caps the brute-force search space on a 6-digit code (1e6 possibilities)
// to 5 tries per sent code instead of unlimited attempts within the 5-min TTL.
const MAX_VERIFY_ATTEMPTS = 5;
const OTP_TTL_SECONDS = 5 * 60;

// Reset-authorization: a short-lived, single-use, opaque (non-JWT) proof that
// this browser just completed OTP verification for this user. Deliberately
// not a JWT — it carries no claims, is meaningless outside Redis, and is
// consumed (getdel) by exactly one call to /api/auth/reset-password.
const RESET_AUTH_TTL_SECONDS = 10 * 60;

const GENERIC_ERROR = { ok: false, error: { message: "Invalid or expired code" } } as const;

/**
 * POST /api/auth/forgot-password/verify
 *
 * Verifies the OTP sent by /api/auth/forgot-password and, on success, issues
 * a short-lived Redis-backed reset-authorization token the client carries
 * in memory into the "set new password" step. Returns the same generic error
 * whether the account doesn't exist, the account is an admin, or the code is
 * simply wrong — enumeration-safe.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { identifier, channel, otp } = body as { identifier?: string; channel?: string; otp?: string };

    if (
      !identifier ||
      typeof identifier !== "string" ||
      (channel !== "email" && channel !== "phone") ||
      !otp ||
      typeof otp !== "string" ||
      otp.length !== 6
    ) {
      return NextResponse.json(GENERIC_ERROR, { status: 400 });
    }

    const normalized = channel === "email" ? identifier.toLowerCase().trim() : identifier.trim();

    const user =
      channel === "email"
        ? await db.user.findUnique({ where: { email: normalized }, select: { id: true, role: true } })
        : await db.user.findFirst({ where: { phone: normalized }, select: { id: true, role: true } });

    if (!user || user.role === "admin") {
      return NextResponse.json(GENERIC_ERROR, { status: 400 });
    }

    const otpKey = `pwreset:otp:${channel}:${user.id}`;
    const attemptsKey = `pwreset:otp:attempts:${channel}:${user.id}`;
    const redis = getRedis();

    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, OTP_TTL_SECONDS);
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      // Burn the OTP too — the user must request a fresh code, not just retry.
      await redis.del(otpKey);
      return NextResponse.json(
        { ok: false, error: { message: "Too many incorrect attempts. Please request a new code." } },
        { status: 429 }
      );
    }

    const valid = await verifyOtp(otpKey, otp);
    if (!valid) {
      return NextResponse.json(GENERIC_ERROR, { status: 400 });
    }

    await redis.del(attemptsKey);

    const resetAuth = randomBytes(32).toString("hex");
    await redis.set(`pwreset:auth:${resetAuth}`, user.id, { ex: RESET_AUTH_TTL_SECONDS });

    return NextResponse.json({ ok: true, resetAuth });
  } catch (err) {
    console.error("[forgot-password/verify]", err);
    return NextResponse.json({ ok: false, error: { message: "Something went wrong" } }, { status: 500 });
  }
}
