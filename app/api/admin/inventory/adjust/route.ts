import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

/** POST /api/admin/inventory/adjust
 *  Body: { productId, type: "ADD"|"REMOVE"|"SET", quantity, reason, notes? }
 *  Returns the updated product with new stock value.
 */
export async function POST(req: Request) {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  let body: { productId: string; type: "ADD" | "REMOVE" | "SET"; quantity: number; reason: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  const { productId, type, quantity, reason, notes } = body;

  if (!productId || !type || quantity == null || !reason) {
    return Err.validation("productId, type, quantity, and reason are required");
  }
  if (quantity < 0) return Err.validation("Quantity must be a non-negative number");

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return Err.notFound("Product");

  let newStock: number;
  if (type === "ADD") {
    newStock = product.stock + Math.floor(quantity);
  } else if (type === "REMOVE") {
    newStock = Math.max(0, product.stock - Math.floor(quantity));
  } else if (type === "SET") {
    newStock = Math.floor(quantity);
  } else {
    return Err.validation("type must be ADD, REMOVE, or SET");
  }

  try {
    const updated = await db.product.update({
      where: { id: productId },
      data: { stock: newStock },
      include: { category: { select: { name: true } } },
    });

    console.info(`[inventory/adjust] Product ${product.name}: ${product.stock} → ${newStock} (${type}, reason: ${reason}, notes: ${notes ?? "none"})`);

    return ok({
      id: updated.id,
      name: updated.name,
      previousStock: product.stock,
      newStock: updated.stock,
      status:
        updated.stock === 0 ? "out_of_stock" : updated.stock < 10 ? "low_stock" : "in_stock",
    });
  } catch (e) {
    console.error("[inventory/adjust/POST]", e);
    return Err.internal();
  }
}
