/**
 * POST /api/admin/otp/verify
 * Verifies the 6-digit OTP submitted by the admin during login.
 *
 * Max 5 attempts — account locked out after that (entry removed from store).
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { verifyOtp } from "@/lib/otp";
import { getRedis } from "@/lib/redis";
import { reportError } from "@/lib/observability";

const MAX_ATTEMPTS = 5;
const OTP_TTL_SECONDS = 10 * 60;

const BodySchema = z.object({
  userId: z.string(),
  otp: z.string().length(6),
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

    const { userId, otp } = parsed.data;
    if (userId !== session.user.id) return Err.forbidden();

    const otpKey = `admin:2fa:otp:${userId}`;
    const attemptsKey = `admin:2fa:otp:attempts:${userId}`;
    const redis = getRedis();

    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, OTP_TTL_SECONDS);
    if (attempts > MAX_ATTEMPTS) {
      await redis.del(otpKey);
      return Err.validation("Too many failed attempts — request a new code");
    }

    // verifyOtp does an atomic get-then-delete, so a code can only ever be
    // consumed once and no expired/missing entry can match.
    const valid = await verifyOtp(otpKey, otp);
    if (!valid) {
      return Err.validation(`Invalid code — ${MAX_ATTEMPTS - attempts} attempts remaining`);
    }

    await redis.del(attemptsKey);

    console.info("[admin/otp/verify] OTP verified for admin", userId);
    return ok({ verified: true });
  } catch (e) {
    console.error("[admin/otp/verify] POST error", e);
    reportError(e, { route: "POST /api/admin/otp/verify", tags: { flow: "admin-2fa-otp" } });
    return Err.internal();
  }
}
