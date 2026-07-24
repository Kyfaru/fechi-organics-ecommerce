import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection } from "next/server";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { isGlobalScope } from "@/lib/branch-access";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory/constants";

function statusFor(stock: number): "out_of_stock" | "low_stock" | "in_stock" {
  if (stock === 0) return "out_of_stock";
  if (stock < LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

/** GET /api/admin/inventory
 *  Branch-scoped caller: returns that branch's stock rows for active products.
 *  Global-tier caller (Super Admin/Admin/HQ): returns a per-branch breakdown
 *  across all branches, plus the branch list for a UI filter dropdown.
 */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { inventory: ["view"] });
  if (denied) return denied;

  try {
    const caller = await loadCallerContext();
    if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();

    if (!isGlobalScope(caller)) {
      // Branch-scoped staff only ever see their own branch's stock.
      const stockRows = await db.branchProductStock.findMany({
        where: {
          branchId: caller.branchId!,
          product: { isActive: true },
        },
        include: {
          product: {
            include: {
              category: { select: { name: true } },
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
        },
        orderBy: { product: { name: "asc" } },
      });

      const items = stockRows.map((row) => ({
        id: row.product.id,
        name: row.product.name,
        slug: row.product.slug,
        categoryName: row.product.category.name,
        stock: row.stock,
        imageKey: row.product.images[0]?.objectKey ?? null,
        status: statusFor(row.stock),
      }));

      const stats = {
        totalSKUs: items.length,
        inStock: items.filter((i) => i.status === "in_stock").length,
        lowStock: items.filter((i) => i.status === "low_stock").length,
        outOfStock: items.filter((i) => i.status === "out_of_stock").length,
      };

      return ok({ items, stats });
    }

    // Global-tier caller — breakdown across every branch, one row per
    // (branch, product), tagged with branchId/branchName so the admin UI can
    // filter or group. Also returns the branch list for that filter dropdown.
    const [stockRows, branches] = await Promise.all([
      db.branchProductStock.findMany({
        where: { product: { isActive: true } },
        include: {
          branch: { select: { id: true, name: true } },
          product: {
            include: {
              category: { select: { name: true } },
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
        },
        orderBy: [{ branch: { name: "asc" } }, { product: { name: "asc" } }],
      }),
      db.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const items = stockRows.map((row) => ({
      id: row.product.id,
      name: row.product.name,
      slug: row.product.slug,
      categoryName: row.product.category.name,
      stock: row.stock,
      imageKey: row.product.images[0]?.objectKey ?? null,
      status: statusFor(row.stock),
      branchId: row.branch.id,
      branchName: row.branch.name,
    }));

    const stats = {
      totalSKUs: items.length,
      inStock: items.filter((i) => i.status === "in_stock").length,
      lowStock: items.filter((i) => i.status === "low_stock").length,
      outOfStock: items.filter((i) => i.status === "out_of_stock").length,
    };

    return ok({ items, stats, branches });
  } catch (e) {
    console.error("[inventory/GET]", e);
    return Err.internal(e);
  }
}
