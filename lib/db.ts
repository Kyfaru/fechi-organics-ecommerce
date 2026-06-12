/**
 * Prisma Client singleton — lazy initialization.
 *
 * DATABASE_URL is only required at runtime, not during `next build`.
 * The client is NOT created at module load time — it is created on first
 * access via the Proxy. This means:
 *   - `next build` succeeds even without a real DATABASE_URL.
 *   - The first real database call at runtime will throw a clear error if
 *     DATABASE_URL is still missing.
 *
 * In development, hot-module replacement would otherwise create a new client
 * on every file save and exhaust the PostgreSQL connection pool. We pin the
 * instance to `globalThis` so it survives HMR restarts.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type GlobalWithPrisma = typeof globalThis & {
  _prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "[db] DATABASE_URL environment variable is not set. " +
        "Add it to your .env.local file before starting the server."
    );
  }

  const adapter = new PrismaPg({ connectionString });
  // Prisma 7 passes adapter via constructor options
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as GlobalWithPrisma;

/**
 * Returns the shared PrismaClient instance.
 * Calling this will throw at runtime if DATABASE_URL is not set.
 * Safe to import at module level — the function is not called until invoked.
 */
export function getDb(): PrismaClient {
  if (!globalForPrisma._prisma) {
    globalForPrisma._prisma = createPrismaClient();
  }
  return globalForPrisma._prisma;
}

/**
 * Convenience export: `db` is a Proxy that delegates every property access to
 * the real PrismaClient, creating it on first access. This lets call-sites
 * write `db.user.findMany(...)` without calling `getDb()` explicitly.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
