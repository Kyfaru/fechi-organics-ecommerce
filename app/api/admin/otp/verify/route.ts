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
// Import the shared in-memory store from the send route
import { otpStore } from "@/app/api/admin/otp/send/route";

const MAX_ATTEMPTS = 5;

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

    const entry = otpStore.get(userId);
    if (!entry) {
      return Err.validation("No OTP found — request a new code");
    }

    if (Date.now() > entry.expires) {
      otpStore.delete(userId);
      return Err.validation("OTP has expired — request a new code");
    }

    entry.attempts += 1;

    if (entry.attempts > MAX_ATTEMPTS) {
      otpStore.delete(userId);
      return Err.validation("Too many failed attempts — request a new code");
    }

    if (otp !== entry.otp) {
      return Err.validation(`Invalid code — ${MAX_ATTEMPTS - entry.attempts} attempts remaining`);
    }

    // Correct OTP — clear entry so it cannot be reused
    otpStore.delete(userId);

    console.info("[admin/otp/verify] OTP verified for admin", userId);
    return ok({ verified: true });
  } catch (e) {
    console.error("[admin/otp/verify] POST error", e);
    return Err.internal();
  }
}
