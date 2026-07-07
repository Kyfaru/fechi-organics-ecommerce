import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Builds an Upstash sliding-window rate limiter, or null when Redis env vars
 * are absent.
 *
 * Extracted from the identical construction duplicated in
 * app/api/auth/stream/route.ts and app/api/payments/stream/route.ts. Callers
 * must gate on a null return (matches both existing routes) — this lets the
 * app run without Redis configured (e.g. local dev) by simply skipping rate
 * limiting rather than crashing.
 *
 * @param limiter - e.g. Ratelimit.slidingWindow(10, '1 m').
 * @param prefix - Redis key prefix for this limiter's keyspace, so different
 *                 limiters never share counters (e.g. 'sse_session' vs 'sse_payment').
 * @returns A Ratelimit instance, or null if UPSTASH_REDIS_REST_URL/TOKEN are unset.
 */
export function makeRatelimit(
  limiter: ReturnType<typeof Ratelimit.slidingWindow>,
  prefix: string
): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter,
    prefix,
  });
}
