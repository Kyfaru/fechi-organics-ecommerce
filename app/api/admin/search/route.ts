import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { searchAdminPages } from "@/lib/search/admin-pages";
import { requireStaffSession } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

const RESULT_LIMIT = 5;

/**
 * GET /api/admin/search?q=<query>
 *
 * Global admin search: online + in-store order numbers/customer info,
 * customer name/email, product name, and a static index of admin
 * pages/settings sections.
 */
export async function GET(req: NextRequest) {
  await connection();
  const denied = await requireStaffSession(req);
  if (denied) return denied;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return ok({ results: [] });

  try {
    const [orders, inStoreOrders, customers, products] = await Promise.all([
      db.order.findMany({
        where: {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { guestEmail: { contains: q, mode: "insensitive" } },
            { deliveryPhone: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } },
          ],
        },
        select: { id: true, orderNumber: true, deliveryCounty: true, totalKes: true },
        take: RESULT_LIMIT,
        orderBy: { createdAt: "desc" },
      }),
      db.inStoreOrder.findMany({
        where: {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerPhone: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, orderNumber: true, customerName: true, totalKes: true },
        take: RESULT_LIMIT,
        orderBy: { createdAt: "desc" },
      }),
      db.user.findMany({
        where: {
          role: "client",
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: RESULT_LIMIT,
      }),
      db.product.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { zohoSku: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, slug: true, priceKes: true },
        take: RESULT_LIMIT,
      }),
    ]);

    const results = [
      ...orders.map((o) => ({
        title: `Order ${o.orderNumber}`,
        description: `${o.deliveryCounty ?? ""} · KES ${(o.totalKes / 1).toLocaleString("en-KE")}`,
        url: `/admin/orders?q=${encodeURIComponent(o.orderNumber ?? "")}`,
      })),
      ...inStoreOrders.map((o) => ({
        title: `In-store order ${o.orderNumber}`,
        description: `${o.customerName ?? "Walk-in customer"} · KES ${o.totalKes.toLocaleString("en-KE")}`,
        url: `/admin/orders?q=${encodeURIComponent(o.orderNumber ?? "")}`,
      })),
      ...customers.map((c) => ({
        title: c.name || c.email,
        description: c.email,
        url: `/admin/customers?q=${encodeURIComponent(c.email)}`,
      })),
      ...products.map((p) => ({
        title: p.name,
        description: `KES ${p.priceKes.toLocaleString("en-KE")}`,
        url: `/admin/products?q=${encodeURIComponent(p.slug)}`,
      })),
      ...searchAdminPages(q),
    ].slice(0, RESULT_LIMIT * 5);

    return ok({ results });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/search", tags: { domain: "search" } });
    console.error("[admin/search] GET error", e);
    return Err.internal();
  }
}
