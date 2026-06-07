import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { ok, Err } from "@/lib/api";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Err.authRequired();

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (user?.role !== "admin") return Err.forbidden();

    const [
      totalProducts,
      activeProducts,
      totalCustomers,
      newMessages,
      totalCategories,
      recentMessages,
      // TODO: add when orders model is ready
      totalOrders,
      pendingOrders,
    ] = await Promise.all([
      db.product.count(),
      db.product.count({ where: { isActive: true } }),
      db.user.count(),
      db.contactMessage.count({ where: { status: "new" } }),
      db.category.count({ where: { isActive: true } }),
      db.contactMessage.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          subject: true,
          status: true,
          createdAt: true,
        },
      }),
      // order model does not exist yet — placeholder until orders are implemented
      Promise.resolve(0),
      Promise.resolve(0),
    ]);

    return ok({
      totalProducts,
      activeProducts,
      totalCustomers,
      newMessages,
      totalCategories,
      recentMessages,
      totalOrders,
      pendingOrders,
    });
  } catch (e) {
    console.error("[admin/dashboard] GET error", e);
    return Err.internal();
  }
}
