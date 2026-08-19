/**
 * Seeds the badge catalog from lib/points/badge-families.ts.
 *
 * Idempotent: badge ids are stable slugs, so re-running updates rows in place
 * and never orphans a badge somebody already earned. Safe to run after every
 * change to the family config.
 *
 *   pnpm seed:badges
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateBadgeCatalog } from "../lib/points/badge-families";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });


async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const catalog = generateBadgeCatalog();

  const totalPoints = catalog.reduce((s, b) => s + b.points, 0);
  console.log(
    `[seed-badges] ${catalog.length} badges, ${totalPoints.toLocaleString()} points of headroom`,
  );

  let written = 0;
  // Chunked so a large catalog doesn't open a thousand round-trips at once.
  const CHUNK = 50;
  for (let i = 0; i < catalog.length; i += CHUNK) {
    await Promise.all(
      catalog.slice(i, i + CHUNK).map((b) => {
  console.log("[seed-badges] badge:", {
    id: b.id,
    name: b.name,
    points: b.points,
    threshold: b.threshold,
  });

  return db.badge.upsert({
    where: { id: b.id },
    create: b,
    update: {
      familyKey: b.familyKey,
      tier: b.tier,
      name: b.name,
      description: b.description,
      icon: b.icon,
      rarity: b.rarity,
      points: b.points,
      grantType: b.grantType,
      ruleKey: b.ruleKey,
      threshold: b.threshold,
      hidden: b.hidden,
      sortOrder: b.sortOrder,
    },
  });
}),
    );
    written += Math.min(CHUNK, catalog.length - i);
    process.stdout.write(`\r[seed-badges] ${written}/${catalog.length}`);
  }

  console.log(`\n[seed-badges] done`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("[seed-badges] failed", e);
  process.exit(1);
});
