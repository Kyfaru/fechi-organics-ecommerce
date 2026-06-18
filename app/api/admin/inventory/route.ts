import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

/** GET /api/admin/inventory
 *  Returns all active products with category + first image, plus summary stats.
 */
export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  try {
    const products = await db.product.findMany({
      where: { isActive: true },
      include: {
        category: { select: { name: true } },
        images: { take: 1, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { name: "asc" },
    });

    // Compute stock status per product
    const items = products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      categoryName: p.category.name,
      stock: p.stock,
      imageKey: p.images[0]?.objectKey ?? null,
      status:
        p.stock === 0
          ? "out_of_stock"
          : p.stock < 10
          ? "low_stock"
          : "in_stock",
    }));

    const stats = {
      totalSKUs: items.length,
      inStock: items.filter((i) => i.status === "in_stock").length,
      lowStock: items.filter((i) => i.status === "low_stock").length,
      outOfStock: items.filter((i) => i.status === "out_of_stock").length,
    };

    return ok({ items, stats });
  } catch (e) {
    console.error("[inventory/GET]", e);
    return Err.internal();
  }
}
