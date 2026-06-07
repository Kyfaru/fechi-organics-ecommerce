/**
 * Upstash Redis client with graceful fallback.
 * Without UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN the module
 * exports a no-op stub so the app runs locally without Redis.
 */

type RedisLike = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, options?: { ex?: number }) => Promise<unknown>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
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
    _redis = new Redis({ url, token }) as RedisLike;
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
