/**
 * GET /api/admin/diagnostics/latency?n=15
 *
 * Super-admin only. Times the three hops every payment request makes — the
 * app->Postgres round trip, the app->Redis round trip, and (optionally) a
 * KCB token fetch is deliberately NOT included (no money, but real creds) —
 * and reports p50/p95 in ms. Run it from the deployed app, since the point is
 * the VPS<->Neon<->Upstash distance. A cold-start shows up as a high max.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, p50: at(0.5), p95: at(0.95), max: s[s.length - 1] };
}

async function time(fn: () => Promise<unknown>, n: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    out.push(Math.round((performance.now() - t) * 10) / 10);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const profile = await db.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: { isSuperAdmin: true, isActive: true },
  });
  if (!profile?.isSuperAdmin || !profile.isActive) return new Response("Forbidden", { status: 403 });

  const n = Math.min(50, Math.max(3, Number(req.nextUrl.searchParams.get("n") ?? 15)));
  const redis = getRedis();
  const [dbMs, redisGetMs, redisSetMs] = [
    await time(() => db.$queryRaw`SELECT 1`, n),
    await time(() => redis.get("latency_probe"), n),
    await time(() => redis.set("latency_probe", "1", { ex: 30 }), n),
  ];
  return Response.json({
    ok: true,
    note: "Same-region targets: db p50 < 10ms, redis get < 5ms. Cross-continent shows as 100ms+ per hop; initiate makes ~15-25 hops.",
    db: stats(dbMs),
    redisGet: stats(redisGetMs),
    redisSet: stats(redisSetMs),
  });
}
