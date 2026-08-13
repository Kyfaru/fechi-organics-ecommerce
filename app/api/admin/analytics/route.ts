/**
 * GET /api/admin/analytics?tab=overview&from=2026-05-18&to=2026-06-17
 *
 * Admin-only analytics endpoint. Returns data shaped per the requested tab.
 * All aggregations happen in the database or in JS where Prisma groupBy
 * lacks date-truncation support.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// Helper: bucket a list of orders by day into ordersChart shape
// Orders with paymentStatus === "FAILED" are treated as "failed".
// Orders with status === "CANCELLED" are "cancelled".
// Orders with status DELIVERED/SHIPPED/PROCESSING/CONFIRMED and paymentStatus PAID
// are "successful". Everything else contributes to "all".
// ---------------------------------------------------------------------------
type OrderChartRow = {
  date: string;
  all: number;
  successful: number;
  failed: number;
  cancelled: number;
};

function buildOrdersChart(
  orders: { createdAt: Date; status: string; paymentStatus: string }[],
  from: Date,
  to: Date,
): OrderChartRow[] {
  const map: Record<string, { all: number; successful: number; failed: number; cancelled: number }> = {};

  // Pre-fill every day in range with zeros
  const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
  for (let i = 0; i <= diffDays; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    map[key] = { all: 0, successful: 0, failed: 0, cancelled: 0 };
  }

  for (const ord of orders) {
    const key = ord.createdAt.toISOString().slice(0, 10);
    if (!(key in map)) continue;
    map[key].all += 1;

    if (ord.status === "CANCELLED") {
      map[key].cancelled += 1;
    } else if (ord.paymentStatus === "FAILED") {
      map[key].failed += 1;
    } else if (
      ord.paymentStatus === "PAID" &&
      ["DELIVERED", "SHIPPED", "PROCESSING", "CONFIRMED"].includes(ord.status)
    ) {
      map[key].successful += 1;
    }
  }

  return Object.entries(map).map(([date, counts]) => ({ date, ...counts }));
}

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { analytics: ["view"] });
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") ?? "overview";

    // Parse date range — default last 30 days
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    defaultFrom.setHours(0, 0, 0, 0);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const from = fromParam ? new Date(fromParam) : defaultFrom;
    const to = toParam ? new Date(toParam) : now;

    // Clamp to start/end of day
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const dateFilter = { gte: from, lte: to };

    // -------------------------------------------------------------------------
    // Overview tab
    // -------------------------------------------------------------------------
    if (tab === "overview") {
      const [
        revenueAgg,
        ordersCount,
        newCustomers,
        paidOrders,
        topProductsRaw,
        topCustomersRaw,
        revenueChartOrders,
        ordersForChart,
        inStoreRevenueAgg,
        inStoreOrdersCount,
        inStorePaidOrders,
        inStoreTopProductsRaw,
        inStoreTopCustomersRaw,
        inStoreRevenueChartOrders,
        inStoreOrdersForChart,
      ] = await Promise.all([
        db.order.aggregate({
          _sum: { totalKes: true },
          where: { paymentStatus: "PAID", createdAt: dateFilter },
        }),
        db.order.count({ where: { createdAt: dateFilter } }),
        db.user.count({ where: { role: "client", createdAt: dateFilter } }),
        db.order.count({ where: { paymentStatus: "PAID", createdAt: dateFilter } }),
        // Top 5 products by number of order items
        db.orderItem.groupBy({
          by: ["productId", "name"],
          _count: { _all: true },
          _sum: { priceKes: true },
          orderBy: { _count: { productId: "desc" } },
          take: 5,
          where: { order: { createdAt: dateFilter } },
        }),
        // Top 5 customers by spend
        db.order.groupBy({
          by: ["userId"],
          _sum: { totalKes: true },
          _count: { _all: true },
          orderBy: { _sum: { totalKes: "desc" } },
          take: 5,
          where: { paymentStatus: "PAID", userId: { not: null }, createdAt: dateFilter },
        }),
        // Daily revenue for chart
        db.order.findMany({
          where: { paymentStatus: "PAID", createdAt: dateFilter },
          select: { createdAt: true, totalKes: true },
        }),
        // All orders for order-status area chart (F2/F5)
        db.order.findMany({
          where: { createdAt: dateFilter },
          select: { createdAt: true, status: true, paymentStatus: true },
        }),
        db.inStoreOrder.aggregate({
          _sum: { totalKes: true },
          where: { paymentStatus: "PAID", createdAt: dateFilter },
        }),
        db.inStoreOrder.count({ where: { createdAt: dateFilter } }),
        db.inStoreOrder.count({ where: { paymentStatus: "PAID", createdAt: dateFilter } }),
        db.inStoreOrderItem.groupBy({
          by: ["productId", "name"],
          _count: { _all: true },
          _sum: { priceKes: true },
          orderBy: { _count: { productId: "desc" } },
          take: 5,
          where: { inStoreOrder: { createdAt: dateFilter } },
        }),
        db.inStoreOrder.groupBy({
          by: ["customerUserId"],
          _sum: { totalKes: true },
          _count: { _all: true },
          orderBy: { _sum: { totalKes: "desc" } },
          take: 5,
          where: { paymentStatus: "PAID", customerUserId: { not: null }, createdAt: dateFilter },
        }),
        db.inStoreOrder.findMany({
          where: { paymentStatus: "PAID", createdAt: dateFilter },
          select: { createdAt: true, totalKes: true },
        }),
        // fulfillmentStatus values (CONFIRMED/PICKED_UP) double as OrderStatus
        // members, except PICKED_UP — mapped to DELIVERED below so it counts
        // as "successful" the same way a delivered online order does.
        db.inStoreOrder.findMany({
          where: { createdAt: dateFilter },
          select: { createdAt: true, fulfillmentStatus: true, paymentStatus: true },
        }),
      ]);

      // Build daily revenue chart
      const dailyMap: Record<string, number> = {};
      for (const ord of [...revenueChartOrders, ...inStoreRevenueChartOrders]) {
        const key = ord.createdAt.toISOString().slice(0, 10);
        dailyMap[key] = (dailyMap[key] ?? 0) + ord.totalKes;
      }

      const totalRevenue = (revenueAgg._sum.totalKes ?? 0) + (inStoreRevenueAgg._sum.totalKes ?? 0);
      const combinedOrders = ordersCount + inStoreOrdersCount;
      const combinedPaidOrders = paidOrders + inStorePaidOrders;
      const aov = combinedPaidOrders > 0 ? Math.round(totalRevenue / combinedPaidOrders) : 0;

      // Build chart from from→to
      const revenueChart: { date: string; amount: number }[] = [];
      const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        revenueChart.push({ date: key, amount: dailyMap[key] ?? 0 });
      }

      // Build orders chart (order-status area chart data)
      const inStoreForChart = inStoreOrdersForChart.map((o) => ({
        createdAt: o.createdAt,
        status: o.fulfillmentStatus === "PICKED_UP" ? "DELIVERED" : o.fulfillmentStatus,
        paymentStatus: o.paymentStatus,
      }));
      const ordersChart = buildOrdersChart([...ordersForChart, ...inStoreForChart], from, to);

      // Resolve user names for top customers (online + in-store share the user table)
      const customerIds = [
        ...topCustomersRaw.map((c) => c.userId),
        ...inStoreTopCustomersRaw.map((c) => c.customerUserId),
      ].filter(Boolean) as string[];
      const customerUsers = await db.user.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = Object.fromEntries(customerUsers.map((u) => [u.id, u]));

      // Merge online + in-store spend per customer before ranking
      const spendByCustomer = new Map<string, { orders: number; totalSpend: number }>();
      for (const c of topCustomersRaw) {
        if (!c.userId) continue;
        spendByCustomer.set(c.userId, { orders: c._count._all, totalSpend: c._sum.totalKes ?? 0 });
      }
      for (const c of inStoreTopCustomersRaw) {
        if (!c.customerUserId) continue;
        const existing = spendByCustomer.get(c.customerUserId) ?? { orders: 0, totalSpend: 0 };
        existing.orders += c._count._all;
        existing.totalSpend += c._sum.totalKes ?? 0;
        spendByCustomer.set(c.customerUserId, existing);
      }
      const topCustomers = [...spendByCustomer.entries()]
        .sort((a, b) => b[1].totalSpend - a[1].totalSpend)
        .slice(0, 5)
        .map(([userId, v]) => ({
          userId,
          name: userMap[userId]?.name ?? "Guest",
          email: userMap[userId]?.email ?? "",
          orders: v.orders,
          totalSpend: v.totalSpend,
        }));

      // Merge online + in-store product sales before ranking
      const salesByProduct = new Map<string, { name: string; orders: number; revenue: number }>();
      for (const p of [...topProductsRaw, ...inStoreTopProductsRaw]) {
        const existing = salesByProduct.get(p.productId) ?? { name: p.name, orders: 0, revenue: 0 };
        existing.orders += p._count._all;
        existing.revenue += p._sum.priceKes ?? 0;
        salesByProduct.set(p.productId, existing);
      }
      const topProducts = [...salesByProduct.entries()]
        .sort((a, b) => b[1].orders - a[1].orders)
        .slice(0, 5)
        .map(([productId, v]) => ({
          productId,
          name: v.name,
          orders: v.orders,
          revenue: v.revenue,
          pctOfTotal: totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 1000) / 10 : 0,
        }));

      return ok({
        tab: "overview",
        stats: {
          revenue: totalRevenue,
          orders: combinedOrders,
          aov,
          conversionRate: 3.2, // placeholder
          newCustomers,
          returningRate: 68, // placeholder
        },
        revenueChart,
        ordersChart,
        topProducts,
        topCustomers,
        // Placeholder traffic data — replace with real source tracking when available
        trafficSources: [
          { source: "Direct", pct: 40 },
          { source: "Social", pct: 30 },
          { source: "Email", pct: 20 },
          { source: "Other", pct: 10 },
        ],
      });
    }

    // -------------------------------------------------------------------------
    // Sales tab
    // -------------------------------------------------------------------------
    if (tab === "sales") {
      const [orders, revenueByDay, ordersForChart, inStoreOrders, inStoreRevenueByDay, inStoreOrdersForChart] = await Promise.all([
        db.order.findMany({
          where: { createdAt: dateFilter },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            totalKes: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
            items: { select: { quantity: true } },
          },
        }),
        db.order.findMany({
          where: { paymentStatus: "PAID", createdAt: dateFilter },
          select: { createdAt: true, totalKes: true },
        }),
        // Orders for order-status area chart (F2/F5)
        db.order.findMany({
          where: { createdAt: dateFilter },
          select: { createdAt: true, status: true, paymentStatus: true },
        }),
        db.inStoreOrder.findMany({
          where: { createdAt: dateFilter },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            fulfillmentStatus: true,
            paymentStatus: true,
            totalKes: true,
            createdAt: true,
            customerName: true,
            customerEmail: true,
            items: { select: { quantity: true } },
          },
        }),
        db.inStoreOrder.findMany({
          where: { paymentStatus: "PAID", createdAt: dateFilter },
          select: { createdAt: true, totalKes: true },
        }),
        db.inStoreOrder.findMany({
          where: { createdAt: dateFilter },
          select: { createdAt: true, fulfillmentStatus: true, paymentStatus: true },
        }),
      ]);

      const dailyMap: Record<string, number> = {};
      for (const ord of [...revenueByDay, ...inStoreRevenueByDay]) {
        const key = ord.createdAt.toISOString().slice(0, 10);
        dailyMap[key] = (dailyMap[key] ?? 0) + ord.totalKes;
      }

      const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
      const revenueChart: { date: string; amount: number }[] = [];
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        revenueChart.push({ date: key, amount: dailyMap[key] ?? 0 });
      }

      // Build orders chart — PICKED_UP maps to DELIVERED so in-store pickups
      // count as "successful" the same way a delivered online order does.
      const inStoreForChart = inStoreOrdersForChart.map((o) => ({
        createdAt: o.createdAt,
        status: o.fulfillmentStatus === "PICKED_UP" ? "DELIVERED" : o.fulfillmentStatus,
        paymentStatus: o.paymentStatus,
      }));
      const ordersChart = buildOrdersChart([...ordersForChart, ...inStoreForChart], from, to);

      const formattedOrders = orders.map((o) => ({
        id: o.id,
        channel: "online" as const,
        customer: o.user?.name ?? "Guest",
        email: o.user?.email ?? "",
        items: o.items.reduce((sum, it) => sum + it.quantity, 0),
        totalKes: o.totalKes,
        status: o.status,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt.toISOString(),
      }));
      const formattedInStoreOrders = inStoreOrders.map((o) => ({
        id: o.id,
        channel: "in-store" as const,
        customer: o.customerName ?? "Walk-in customer",
        email: o.customerEmail ?? "",
        items: o.items.reduce((sum, it) => sum + it.quantity, 0),
        totalKes: o.totalKes,
        status: o.fulfillmentStatus as string,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt.toISOString(),
      }));
      const mergedOrders = [...formattedOrders, ...formattedInStoreOrders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return ok({ tab: "sales", revenueChart, ordersChart, orders: mergedOrders });
    }

    // -------------------------------------------------------------------------
    // Products tab
    // -------------------------------------------------------------------------
    if (tab === "products") {
      const [products, inStoreItems] = await Promise.all([
        db.product.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            stock: true,
            ratingAvg: true,
            ratingCount: true,
            category: { select: { name: true } },
            orderItems: {
              where: { order: { createdAt: dateFilter } },
              select: { quantity: true, priceKes: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        // No FK relation to product (denormalized productId, see schema) —
        // join in JS by id instead of a nested `select`.
        db.inStoreOrderItem.findMany({
          where: { inStoreOrder: { createdAt: dateFilter } },
          select: { productId: true, quantity: true, priceKes: true },
        }),
      ]);

      const inStoreByProduct = new Map<string, { orders: number; revenue: number }>();
      for (const i of inStoreItems) {
        const existing = inStoreByProduct.get(i.productId) ?? { orders: 0, revenue: 0 };
        existing.orders += i.quantity;
        existing.revenue += i.priceKes * i.quantity;
        inStoreByProduct.set(i.productId, existing);
      }

      const productTable = products.map((p) => {
        const inStore = inStoreByProduct.get(p.id);
        return {
          id: p.id,
          name: p.name,
          category: p.category.name,
          stock: p.stock,
          orders: p.orderItems.reduce((s, i) => s + i.quantity, 0) + (inStore?.orders ?? 0),
          revenue: p.orderItems.reduce((s, i) => s + i.priceKes * i.quantity, 0) + (inStore?.revenue ?? 0),
          ratingAvg: Math.round(p.ratingAvg * 10) / 10,
          ratingCount: p.ratingCount,
        };
      });

      return ok({ tab: "products", products: productTable });
    }

    // -------------------------------------------------------------------------
    // Customers tab
    // -------------------------------------------------------------------------
    if (tab === "customers") {
      const customers = await db.user.findMany({
        where: { role: "client" },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          orders: {
            select: { totalKes: true, createdAt: true, paymentStatus: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });

      // In-store purchases tied to a registered customer (walk-ins with no
      // linked account can't be folded into this table — nothing to key on).
      const inStoreOrders = await db.inStoreOrder.findMany({
        where: { customerUserId: { in: customers.map((c) => c.id) } },
        select: { customerUserId: true, totalKes: true, createdAt: true, paymentStatus: true },
      });
      const inStoreByCustomer = new Map<string, typeof inStoreOrders>();
      for (const o of inStoreOrders) {
        const key = o.customerUserId!;
        inStoreByCustomer.set(key, [...(inStoreByCustomer.get(key) ?? []), o]);
      }

      const customerTable = customers.map((c) => {
        const allOrders = [...c.orders, ...(inStoreByCustomer.get(c.id) ?? [])];
        const paidOrders = allOrders.filter((o) => o.paymentStatus === "PAID");
        const totalSpent = paidOrders.reduce((s, o) => s + o.totalKes, 0);
        const lastOrder = allOrders.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )[0];
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          createdAt: c.createdAt.toISOString(),
          orders: allOrders.length,
          totalSpent,
          lastOrder: lastOrder?.createdAt.toISOString() ?? null,
          status: allOrders.length > 0 ? "active" : "pending",
        };
      });

      return ok({ tab: "customers", customers: customerTable });
    }

    // -------------------------------------------------------------------------
    // Marketing tab
    // -------------------------------------------------------------------------
    if (tab === "marketing") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const campaigns = await (db as any).campaign.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          sentCount: true,
          scheduledAt: true,
          sentAt: true,
          createdAt: true,
        },
      }) as {
        id: string; name: string; type: string; status: string;
        sentCount: number; scheduledAt: Date | null; sentAt: Date | null; createdAt: Date;
      }[];

      return ok({
        tab: "marketing",
        campaigns: campaigns.map((c) => ({
          ...c,
          scheduledAt: c.scheduledAt?.toISOString() ?? null,
          sentAt: c.sentAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
      });
    }

    // -------------------------------------------------------------------------
    // Inventory tab
    // -------------------------------------------------------------------------
    if (tab === "inventory") {
      const [totalSKUs, inStock, lowStock, outOfStock, byCategory] = await Promise.all([
        db.product.count({ where: { isActive: true } }),
        db.product.count({ where: { isActive: true, stock: { gte: 10 } } }),
        db.product.count({ where: { isActive: true, stock: { gt: 0, lt: 10 } } }),
        db.product.count({ where: { isActive: true, stock: 0 } }),
        db.product.groupBy({
          by: ["categoryId"],
          _sum: { stock: true },
          _count: { _all: true },
          where: { isActive: true },
        }),
      ]);

      // Resolve category names
      const catIds = byCategory.map((b) => b.categoryId);
      const cats = await db.category.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true },
      });
      const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

      const stockByCategory = byCategory.map((b) => ({
        category: catMap[b.categoryId] ?? b.categoryId,
        totalStock: b._sum.stock ?? 0,
        productCount: b._count._all,
      }));

      return ok({ tab: "inventory", totalSKUs, inStock, lowStock, outOfStock, stockByCategory });
    }

    return Err.validation(`Unknown tab: ${tab}`);
  } catch (e) {
    reportError(e, { route: "GET /api/admin/analytics", tags: { domain: "analytics" } });
    console.error("[admin/analytics] GET error", e);
    return Err.internal();
  }
}
