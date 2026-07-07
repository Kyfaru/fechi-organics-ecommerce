import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyOtp } from "@/lib/otp";
import { getRedis } from "@/lib/redis";
import { randomBytes } from "crypto";

const MAX_VERIFY_ATTEMPTS = 5;
const OTP_TTL_SECONDS = 5 * 60;
const RESET_AUTH_TTL_SECONDS = 10 * 60;

const GENERIC_ERROR = { ok: false, error: { message: "Invalid or expired code" } } as const;

/**
 * POST /api/admin/forgot-password/verify
 *
 * Mirrors /api/auth/forgot-password/verify for the admin self-service flow.
 * Issues an `admin:pwreset:auth:*`-namespaced token (never the customer
 * `pwreset:auth:*` namespace) so the two flows can never be confused for
 * one another in Redis.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, otp } = body as { email?: string; otp?: string };

    if (!email || typeof email !== "string" || !otp || typeof otp !== "string" || otp.length !== 6) {
      return NextResponse.json(GENERIC_ERROR, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true },
    });

    if (!user || user.role !== "admin") {
      return NextResponse.json(GENERIC_ERROR, { status: 400 });
    }

    const otpKey = `admin:pwreset:otp:email:${user.id}`;
    const attemptsKey = `admin:pwreset:otp:attempts:email:${user.id}`;
    const redis = getRedis();

    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, OTP_TTL_SECONDS);
    if (attempts > MAX_VERIFY_ATTEMPTS) {
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
    await redis.set(`admin:pwreset:auth:${resetAuth}`, user.id, { ex: RESET_AUTH_TTL_SECONDS });

    return NextResponse.json({ ok: true, resetAuth });
  } catch (err) {
    console.error("[admin/forgot-password/verify]", err);
    return NextResponse.json({ ok: false, error: { message: "Something went wrong" } }, { status: 500 });
  }
}
