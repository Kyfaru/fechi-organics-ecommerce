import { getRedis } from "@/lib/redis";
import { Err } from "@/lib/api";

function clientIp(req: { headers: Headers }): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Abuse guard for the GUEST checkout path specifically (no session).
 *
 * Every payment-initiate route already has a per-userId rate limit, but for
 * a guest that's structurally useless: findOrCreateGuestCustomer mints a
 * brand-new userId for every email it hasn't seen, so an attacker who
 * rotates the email field on each request never hits it. Two real-world
 * consequences: (1) unauthenticated "STK-push bombing" of an arbitrary
 * victim's phone via the merchant's own live M-Pesa/KCB credentials — the
 * limiter never engages because each push comes from a fresh guest userId;
 * (2) unlimited reuse of "one per customer" coupons the same way (see
 * lib/promo.ts's maxUsesPerUser check).
 *
 * This limits by IP (mass fake-account/order creation) and by the phone
 * number an STK push actually targets, checked BEFORE a guest user row is
 * even created — neither key is something a scripted attacker can rotate as
 * cheaply as an email address.
 */
export async function checkGuestCheckoutAbuse(
  req: { headers: Headers },
  phone: string | null | undefined,
): Promise<Response | null> {
  const redis = getRedis();
  const ip = clientIp(req);

  const ipKey = `guest_checkout_abuse:ip:${ip}`;
  const ipAttempts = await redis.incr(ipKey);
  if (ipAttempts === 1) await redis.expire(ipKey, 600); // 10 minutes
  if (ipAttempts > 8) return Err.rateLimited();

  if (phone) {
    const normalizedPhone = phone.replace(/\D/g, "");
    if (normalizedPhone) {
      const phoneKey = `guest_checkout_abuse:phone:${normalizedPhone}`;
      const phoneAttempts = await redis.incr(phoneKey);
      if (phoneAttempts === 1) await redis.expire(phoneKey, 900); // 15 minutes
      if (phoneAttempts > 3) return Err.rateLimited();
    }
  }

  return null;
}
