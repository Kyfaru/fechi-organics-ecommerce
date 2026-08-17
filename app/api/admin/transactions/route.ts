/**
 * GET /api/admin/transactions
 *
 * Admin-only endpoint returning a paginated list of transactions, ordered
 * newest first. Includes the associated order and branch details.
 *
 * Query params:
 *   page (optional, default 1) — page number (1-indexed)
 *   pageSize (optional, default 50, max 100)
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { transactions: ["view"] });
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)),
    );

    const [transactions, total, orderRevenueAgg, inStoreRevenueAgg, pendingCount, inStoreTxCount] = await Promise.all([
      db.transaction.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: {
            select: {
              id: true,
              deliveryPhone: true,
              userId: true,
              user: { select: { name: true, email: true } },
            },
          },
          branch: {
            select: { id: true, name: true },
          },
        },
      }),
      db.transaction.count(),
      // Real, all-time revenue — sum of PAID order totals, not a page-limited
      // sum of payment-attempt amounts (a transaction is a single payment
      // attempt, not a sale; multiple can exist per order via retries).
      db.order.aggregate({ _sum: { totalKes: true, deliveryKes: true }, where: { paymentStatus: "PAID" } }),
      // In-store sales use a separate table entirely — omitting this was why
      // Finance revenue excluded every walk-in sale.
      db.inStoreOrder.aggregate({ _sum: { totalKes: true, deliveryKes: true }, where: { paymentStatus: "PAID" } }),
      db.transaction.count({ where: { status: "PENDING" } }),
      // In-store payment attempts — same "count every attempt" convention as
      // the online `total` above, merged into stats.totalTransactions.
      db.inStoreTransaction.count(),
    ]);

    console.info(
      `[admin/transactions] GET page=${page} pageSize=${pageSize} returned=${transactions.length}`,
    );

    return ok({
      transactions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: {
        // order/inStoreOrder.totalKes is stored in the same smallest-unit
        // (cents) convention as transaction.amount — both go through the
        // client's formatKes(), which divides by 100 — so no scaling needed.
        // Revenue excludes delivery fee (both channels) — tracked separately on Finance.
        totalRevenue:
          (orderRevenueAgg._sum.totalKes ?? 0) - (orderRevenueAgg._sum.deliveryKes ?? 0) +
          (inStoreRevenueAgg._sum.totalKes ?? 0) - (inStoreRevenueAgg._sum.deliveryKes ?? 0),
        pending: pendingCount,
        totalTransactions: total + inStoreTxCount,
      },
    });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/transactions", tags: { domain: "transactions" } });
    console.error("[admin/transactions] GET error", e);
    return Err.internal();
  }
}
