import { db } from "@/lib/db";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// GET /api/admin/customers/[id]/orders
// Returns the customer's orders, newest first, with item count — online
// orders plus successful (PAID) in-store orders, merged and re-sorted, so a
// walk-in customer resolved via lib/customers/find-or-create-walkin.ts shows
// their in-store purchase history here too, not just online orders.
// Capped at 10,000 combined — effectively unbounded for real customer volumes.
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const denied = await requirePermission(req, { customers: ["view"] });
    if (denied) return denied;

    const { id } = await params;

    const [orders, inStoreOrders] = await Promise.all([
      db.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 10000,
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          totalKes: true,
          createdAt: true,
          items: { select: { quantity: true } },
        },
      }),
      db.inStoreOrder.findMany({
        where: { customerUserId: id, paymentStatus: "PAID" },
        orderBy: { createdAt: "desc" },
        take: 10000,
        select: {
          id: true,
          fulfillmentStatus: true,
          paymentStatus: true,
          totalKes: true,
          createdAt: true,
          items: { select: { quantity: true } },
        },
      }),
    ]);

    // itemsCount is total UNITS purchased (sum of line quantities), not the
    // number of order lines — a single line of qty 6 is 6 items, not 1.
    // `_count: { select: { items: true } }` (the previous approach) counted
    // rows, so a customer who bought 6 of one product showed "1 item".
    const merged = [
      ...orders.map((o) => ({
        id: o.id, status: o.status, paymentStatus: o.paymentStatus, totalKes: o.totalKes, createdAt: o.createdAt,
        itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
        kind: "order" as const,
      })),
      ...inStoreOrders.map((o) => ({
        id: o.id,
        status: o.fulfillmentStatus,
        paymentStatus: o.paymentStatus,
        totalKes: o.totalKes,
        createdAt: o.createdAt,
        itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
        kind: "instore" as const,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10000);

    return ok({ orders: merged });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/customers/[id]/orders", tags: { domain: "customers" } });
    console.error("[admin/customers/[id]/orders] GET error", e);
    return Err.internal();
  }
}
