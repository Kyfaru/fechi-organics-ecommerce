import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { searchAdminPages } from "@/lib/search/admin-pages";

const RESULT_LIMIT = 5;

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

/**
 * GET /api/admin/search?q=<query>
 *
 * Global admin search: order numbers, customer name/email, and a static
 * index of admin pages/settings sections.
 */
export async function GET(req: NextRequest) {
  await connection();
  const admin = await requireAdmin();
  if (!admin) return Err.forbidden();

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return ok({ results: [] });

  try {
    const [orders, customers] = await Promise.all([
      db.order.findMany({
        where: { orderNumber: { contains: q, mode: "insensitive" } },
        select: { id: true, orderNumber: true, deliveryCounty: true, totalKes: true },
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
    ]);

    const results = [
      ...orders.map((o) => ({
        title: `Order ${o.orderNumber}`,
        description: `${o.deliveryCounty ?? ""} · KES ${(o.totalKes / 1).toLocaleString("en-KE")}`,
        url: `/admin/orders?q=${encodeURIComponent(o.orderNumber ?? "")}`,
      })),
      ...customers.map((c) => ({
        title: c.name || c.email,
        description: c.email,
        url: `/admin/customers?q=${encodeURIComponent(c.email)}`,
      })),
      ...searchAdminPages(q),
    ].slice(0, RESULT_LIMIT * 3);

    return ok({ results });
  } catch (e) {
    console.error("[admin/search] GET error", e);
    return Err.internal();
  }
}
