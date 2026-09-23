/**
 * Upstash Redis client with graceful fallback.
 * Without UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN the module
 * exports a no-op stub so the app runs locally without Redis.
 */

type RedisLike = {
  get: (key: string) => Promise<unknown>;
  // nx: only set if the key doesn't already exist (or has expired) — used
  // for short-lived locks. Returns null/falsy when nx is set and the key
  // already exists, matching real Redis's SET ... NX behavior.
  set: (key: string, value: unknown, options?: { ex?: number; nx?: boolean }) => Promise<unknown>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  del: (key: string) => Promise<number>;
  // Atomic read-then-delete — used anywhere a value must be single-use
  // (OTP verification, one-time reset-authorization tokens) so two concurrent
  // requests can never both "win" against the same code/token.
  getdel: (key: string) => Promise<unknown>;
};

function makeStub(): RedisLike {
  const store = new Map<string, { value: unknown; expiresAt?: number }>();

  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, opts) {
      if (opts?.nx) {
        const existing = store.get(key);
        const stillLive = existing && (!existing.expiresAt || Date.now() <= existing.expiresAt);
        if (stillLive) return null;
      }
      store.set(key, {
        value,
        expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : undefined,
      });
      return "OK";
    },
    async incr(key) {
      const current = ((await this.get(key)) as number) ?? 0;
      const next = current + 1;
      await this.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      const entry = store.get(key);
      if (!entry) return 0;
      store.set(key, { ...entry, expiresAt: Date.now() + seconds * 1000 });
      return 1;
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async getdel(key) {
      const value = await this.get(key);
      store.delete(key);
      return value;
    },
  };
}

let _redis: RedisLike | null = null;

export function getRedis(): RedisLike {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    // Lazy import to avoid loading the SDK when keys are missing
    const { Redis } = require("@upstash/redis");
    // ponytail: auto-pipelining is on by default and its Pipeline.exec()
    // assumes Upstash's REST /pipeline response is always an array — a 200
    // response in an unexpected shape throws "res.map is not a function"
    // (confirmed in production Sentry across multiple unrelated routes
    // sharing this client). Nothing here batches concurrent redis calls, so
    // there's no upside to the feature — just disable it.
    _redis = new Redis({ url, token, enableAutoPipelining: false }) as RedisLike;
  } else {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[redis] UPSTASH_REDIS_REST_URL not set — using in-process stub"
      );
    }
    _redis = makeStub();
  }

  return _redis!;
}
