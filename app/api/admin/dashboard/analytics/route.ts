import { NextRequest } from "next/server";
import { connection } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Granularity = "hourly" | "daily" | "weekly" | "monthly";
type Range = "24h" | "7d" | "14d" | "30d" | "3m" | "6m" | "12m" | "all" | "custom";

// ---------------------------------------------------------------------------
// Range → date window
// ---------------------------------------------------------------------------
function resolveWindow(
  range: Range,
  fromParam: string | null,
  toParam: string | null,
): { gte: Date | null; lte: Date; granularity: Granularity } {
  const now = new Date();

  if (range === "custom") {
    const gte = fromParam ? new Date(fromParam) : null;
    const lte = toParam ? new Date(toParam) : now;
    const daySpan = gte ? (lte.getTime() - gte.getTime()) / 86_400_000 : 0;
    return { gte, lte, granularity: daySpan > 90 ? "monthly" : "daily" };
  }

  if (range === "all") {
    return { gte: null, lte: now, granularity: "monthly" };
  }

  const dayMap: Record<Exclude<Range, "all" | "custom">, number> = {
    "24h": 0,
    "7d": 7,
    "14d": 14,
    "30d": 30,
    "3m": 90,
    "6m": 180,
    "12m": 365,
  };
  const granMap: Record<Exclude<Range, "all" | "custom">, Granularity> = {
    "24h": "hourly",
    "7d": "daily",
    "14d": "daily",
    "30d": "daily",
    "3m": "weekly",
    "6m": "weekly",
    "12m": "monthly",
  };

  const days = dayMap[range as Exclude<Range, "all" | "custom">];
  const gte = new Date(now);
  if (range === "24h") {
    gte.setHours(gte.getHours() - 24);
  } else {
    gte.setDate(gte.getDate() - days);
    gte.setHours(0, 0, 0, 0);
  }

  return { gte, lte: now, granularity: granMap[range as Exclude<Range, "all" | "custom">] };
}

// ---------------------------------------------------------------------------
// Bucket key builders
// ---------------------------------------------------------------------------
function hourKey(d: Date): string {
  // "2026-06-21T14:00"
  return d.toISOString().slice(0, 13) + ":00";
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekKey(d: Date): string {
  // ISO week: find the Monday of the week
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getUTCDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function bucketKey(d: Date, granularity: Granularity): string {
  switch (granularity) {
    case "hourly": return hourKey(d);
    case "daily": return dayKey(d);
    case "weekly": return weekKey(d);
    case "monthly": return monthKey(d);
  }
}

// ---------------------------------------------------------------------------
// Generate the ordered list of bucket labels between gte and lte
// ---------------------------------------------------------------------------
function generateBuckets(gte: Date | null, lte: Date, granularity: Granularity): string[] {
  const start = gte ?? new Date(0);
  const buckets: string[] = [];
  const seen = new Set<string>();

  const cursor = new Date(start);

  while (cursor <= lte) {
    const key = bucketKey(cursor, granularity);
    if (!seen.has(key)) {
      seen.add(key);
      buckets.push(key);
    }
    switch (granularity) {
      case "hourly": cursor.setHours(cursor.getHours() + 1); break;
      case "daily": cursor.setDate(cursor.getDate() + 1); break;
      case "weekly": cursor.setDate(cursor.getDate() + 7); break;
      case "monthly": cursor.setMonth(cursor.getMonth() + 1); break;
    }
  }

  // Always include the lte bucket
  const lastKey = bucketKey(lte, granularity);
  if (!seen.has(lastKey)) {
    buckets.push(lastKey);
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/analytics
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Err.authRequired();

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (user?.role !== "admin") return Err.forbidden();

    const { searchParams } = new URL(req.url);
    const range = (searchParams.get("range") ?? "30d") as Range;
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const validRanges: Range[] = ["24h", "7d", "14d", "30d", "3m", "6m", "12m", "all", "custom"];
    if (!validRanges.includes(range)) return Err.validation("Invalid range");
    if (range === "custom" && (!fromParam || !toParam)) {
      return Err.validation("custom range requires from and to params");
    }

    const { gte, lte, granularity } = resolveWindow(range, fromParam, toParam);
    const dateFilter = gte ? { gte, lte } : { lte };

    // ponytail: bucket in JS rather than SQL to avoid timezone headaches with Prisma/Postgres
    const [allOrders, allClients, productSalesRaw] = await Promise.all([
      db.order.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true, totalKes: true, paymentStatus: true },
      }),
      db.user.findMany({
        where: { role: "client", createdAt: dateFilter },
        select: { createdAt: true },
      }),
      db.orderItem.groupBy({
        by: ["productId", "name"],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
      }),
    ]);

    // Build bucket maps
    const orderMap: Record<string, number> = {};
    const revenueMap: Record<string, number> = {};
    const clientMap: Record<string, number> = {};

    for (const ord of allOrders) {
      const key = bucketKey(ord.createdAt, granularity);
      orderMap[key] = (orderMap[key] ?? 0) + 1;
      if (ord.paymentStatus === "PAID") {
        revenueMap[key] = (revenueMap[key] ?? 0) + ord.totalKes;
      }
    }

    for (const u of allClients) {
      const key = bucketKey(u.createdAt, granularity);
      clientMap[key] = (clientMap[key] ?? 0) + 1;
    }

    const buckets = generateBuckets(gte, lte, granularity);

    const totalSold = productSalesRaw.reduce((sum, p) => sum + (p._sum.quantity ?? 0), 0);
    const productSales = productSalesRaw.map((p) => {
      const value = p._sum.quantity ?? 0;
      return {
        productId: p.productId,
        name: p.name,
        value,
        percent: totalSold > 0 ? Math.round((value / totalSold) * 1000) / 10 : 0,
      };
    });

    return ok({
      granularity,
      buckets,
      series: {
        orders: buckets.map((b) => orderMap[b] ?? 0),
        revenue: buckets.map((b) => revenueMap[b] ?? 0),
        clients: buckets.map((b) => clientMap[b] ?? 0),
      },
      productSales,
    });
  } catch (e) {
    console.error("[admin/dashboard/analytics] GET error", e);
    return Err.internal();
  }
}
