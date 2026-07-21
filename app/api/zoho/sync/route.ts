import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { ok, Err } from "@/lib/api";
import { syncAllItems } from "@/lib/zoho-sync";
import { assertTrustedOrigin } from "@/lib/origin-check";

// ---------------------------------------------------------------------------
// Auth helper — mirrors app/api/admin/products/route.ts
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

// ---------------------------------------------------------------------------
// POST /api/zoho/sync  — admin-only, rate-limited to 1 call per 60s per admin
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    // Rate limit: max 1 sync per admin per 60 seconds
    const redis = getRedis();
    const rateLimitKey = `zoho:sync:ratelimit:${admin.id}`;
    const count = await redis.incr(rateLimitKey);
    if (count === 1) {
      await redis.expire(rateLimitKey, 60);
    }
    if (count > 1) {
      return Err.rateLimited();
    }

    console.info("[zoho/sync] Starting full item sync, triggered by", admin.id);
    const result = await syncAllItems();
    console.info("[zoho/sync] Sync complete:", result);

    return ok(result);
  } catch (e) {
    console.error("[zoho/sync] POST error", e);
    return Err.internal(e);
  }
}
