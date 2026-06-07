import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveCart, getCartSummary } from "@/lib/cart";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

const AddSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = AddSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { productId, quantity } = parsed.data;

    // Verify product exists and is in stock
    const product = await db.product.findUnique({ where: { id: productId, isActive: true } });
    if (!product) return Err.notFound("Product");

    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;

    const { cartId, isNew } = await resolveCart(userId);

    // Upsert: increment quantity if already in cart
    await db.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      create: { cartId, productId, quantity },
      update: { quantity: { increment: quantity } },
    });

    await db.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });

    const summary = await getCartSummary(cartId);
    const resp = NextResponse.json({ ok: true, data: summary }, { status: 201 });

    if (isNew && !userId) {
      const cartRow = await db.cart.findUnique({ where: { id: cartId } });
      if (cartRow?.token) {
        resp.cookies.set("fechi_cart", cartRow.token, {
          maxAge: 30 * 24 * 3600,
          sameSite: "lax",
          httpOnly: false,
          path: "/",
        });
      }
    }

    return resp;
  } catch (e) {
    console.error("[cart/items] POST error", e);
    return Err.internal();
  }
}
