import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveCart, getCartSummary } from "@/lib/cart";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";

const UpdateSchema = z.object({ quantity: z.number().int().min(0).max(99) }).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const { productId } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;
    const { cartId } = await resolveCart(userId);

    if (parsed.data.quantity === 0) {
      await db.cartItem.deleteMany({ where: { cartId, productId } });
    } else {
      await db.cartItem.updateMany({
        where: { cartId, productId },
        data: { quantity: parsed.data.quantity },
      });
    }

    await db.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    const summary = await getCartSummary(cartId);
    return ok(summary);
  } catch (e) {
    console.error("[cart/items/[productId]] PATCH error", e);
    return Err.internal(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const { productId } = await params;
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;
    const { cartId } = await resolveCart(userId);

    await db.cartItem.deleteMany({ where: { cartId, productId } });
    await db.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });

    const summary = await getCartSummary(cartId);
    return ok(summary);
  } catch (e) {
    console.error("[cart/items/[productId]] DELETE error", e);
    return Err.internal(e);
  }
}
