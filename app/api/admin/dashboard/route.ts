import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { getPeriodChange } from "@/lib/stats";

export async function GET() {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Err.authRequired();

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (user?.role !== "admin") return Err.forbidden();

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const sixtyDaysAgo = new Date(thirtyDaysAgo);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 30);

    const [
      revenueAgg,
      ordersCount,
      newCustomers,
      lowStockCount,
      recentOrders,
      lowStockProducts,
      allOrders30d,
      ordersByStatusRaw,
      prevRevenueAgg,
      prevOrdersCount,
      prevNewCustomers,
    ] = await Promise.all([
      // Sum of totalKes for PAID orders in last 30 days
      db.order.aggregate({
        _sum: { totalKes: true },
        where: {
          paymentStatus: "PAID",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      // Count of all orders in last 30 days
      db.order.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      // New client users in last 30 days
      db.user.count({
        where: {
          role: "client",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      // Products with stock < 10 that are active
      db.product.count({
        where: { stock: { lt: 10 }, isActive: true },
      }),
      // 8 most recent orders with user info
      db.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          totalKes: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      // 6 low-stock active products with images
      db.product.findMany({
        where: { stock: { lt: 10 }, isActive: true },
        orderBy: { stock: "asc" },
        take: 6,
        select: {
          id: true,
          name: true,
          stock: true,
          images: {
            select: { objectKey: true, isPrimary: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
      // All PAID orders in last 30 days for daily revenue chart — select date+amount
      db.order.findMany({
        where: {
          paymentStatus: "PAID",
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { createdAt: true, totalKes: true },
      }),
      // Order counts grouped by status
      db.order.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      // Previous 30-day period, for real "vs last month" stats-card deltas
      db.order.aggregate({
        _sum: { totalKes: true },
        where: {
          paymentStatus: "PAID",
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
      db.order.count({
        where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
      db.user.count({
        where: { role: "client", createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
    ]);

    // Build daily revenue chart for last 30 days
    // Key each order by its local KE date string (YYYY-MM-DD)
    const dailyMap: Record<string, number> = {};
    for (const ord of allOrders30d) {
      const dateKey = ord.createdAt.toISOString().slice(0, 10);
      dailyMap[dateKey] = (dailyMap[dateKey] ?? 0) + ord.totalKes;
    }

    const revenueChart: { date: string; amount: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      revenueChart.push({ date: key, amount: dailyMap[key] ?? 0 });
    }

    const ordersByStatus = ordersByStatusRaw.map((g) => ({
      status: g.status,
      count: g._count._all,
    }));

    return ok({
      stats: {
        revenue: revenueAgg._sum.totalKes ?? 0,
        orders: ordersCount,
        newCustomers,
        lowStock: lowStockCount,
      },
      statsChange: {
        revenue: getPeriodChange(revenueAgg._sum.totalKes ?? 0, prevRevenueAgg._sum.totalKes ?? 0),
        orders: getPeriodChange(ordersCount, prevOrdersCount),
        newCustomers: getPeriodChange(newCustomers, prevNewCustomers),
      },
      recentOrders,
      lowStockProducts,
      revenueChart,
      ordersByStatus,
    });
  } catch (e) {
    console.error("[admin/dashboard] GET error", e);
    return Err.internal();
  }
}
