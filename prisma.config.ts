/**
 * Prisma 7 configuration file.
 *
 * In Prisma 7, the database URL is no longer specified in schema.prisma.
 * It is provided via this config file using a database adapter.
 *
 * The `migrate` key is a Prisma 7 early-access feature whose TypeScript types
 * are not yet included in @prisma/config 7.8.0. We use a type assertion to
 * satisfy the compiler while retaining the runtime functionality.
 *
 * Usage:
 *   npx prisma migrate deploy   — run pending migrations against DATABASE_URL
 *   npx prisma generate         — regenerate Prisma Client
 *   npx prisma studio           — open the Prisma Studio UI
 */

import { defineConfig, type PrismaConfig } from "prisma/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    seed: "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
  },
} as PrismaConfig & {
  migrate?: { adapter?: () => Promise<unknown> };
  migrations?: { seed?: string };
});
