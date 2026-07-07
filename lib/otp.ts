import { getRedis } from "@/lib/redis";

/**
 * Shared Redis-backed OTP (one-time passcode) helper.
 *
 * Extracted from the duplicated inline logic in app/api/account/2fa/email/**
 * and app/api/account/2fa/phone/** so every OTP consumer — 2FA enrollment,
 * password reset — shares the same generate/store/verify behavior instead of
 * three copies drifting apart over time.
 *
 * Deliberately Redis-backed rather than an in-memory Map (see the anti-pattern
 * in app/api/admin/otp/send/route.ts): an in-memory store only works for a
 * single server instance and silently loses OTPs on every deploy or restart,
 * and rejects valid codes whenever a second instance handles the request.
 */

const OTP_MIN = 100_000;
const OTP_MAX = 999_999;

/**
 * Generates a 6-digit numeric OTP.
 *
 * @returns A zero-padding-free 6-digit string (always 100000-999999).
 */
export function generateOtp(): string {
  return String(Math.floor(OTP_MIN + Math.random() * (OTP_MAX - OTP_MIN + 1)));
}

/**
 * Stores an OTP under a caller-supplied Redis key with a TTL.
 *
 * @param key - Namespaced Redis key, e.g. `pwreset:otp:email:${userId}`.
 *              Namespacing by feature + channel + user keeps 2FA and
 *              password-reset OTPs from ever colliding in Redis.
 * @param otp - The code produced by generateOtp().
 * @param ttlSeconds - Seconds until the code expires.
 */
export async function storeOtp(key: string, otp: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  await redis.set(key, otp, { ex: ttlSeconds });
}

/**
 * Verifies a candidate code against the stored OTP and invalidates it
 * immediately on success — a code can only ever be consumed once, whether
 * that's the legitimate user succeeding or an attacker who guessed right.
 *
 * Uses an atomic get-then-delete (getdel) rather than get() + del() so two
 * concurrent verify requests can never both observe a match before either
 * one clears it.
 *
 * @param key - The same Redis key passed to storeOtp().
 * @param candidate - The code the caller submitted.
 * @returns true if candidate matched a non-expired stored code.
 */
export async function verifyOtp(key: string, candidate: string): Promise<boolean> {
  const redis = getRedis();
  const stored = await redis.getdel(key);
  return !!stored && String(stored) === candidate;
}
