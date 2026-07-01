import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCartSummary } from "@/lib/cart";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** Merge a guest cart into the logged-in user's cart after sign-in. */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const userId = session.user.id;
    const guestToken = req.cookies.get("fechi_cart")?.value;
    if (!guestToken) {
      // No guest cart — just return/create user cart
      const cart = await db.cart.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });
      return ok(await getCartSummary(cart.id));
    }

    const guestCart = await db.cart.findUnique({
      where: { token: guestToken },
      include: { items: true },
    });

    if (!guestCart) {
      const cart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
      return ok(await getCartSummary(cart.id));
    }

    const userCart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId } });

    // Merge each guest item into the user cart (increment if already exists)
    for (const item of guestCart.items) {
      await db.cartItem.upsert({
        where: { cartId_productId: { cartId: userCart.id, productId: item.productId } },
        create: { cartId: userCart.id, productId: item.productId, quantity: item.quantity },
        update: { quantity: { increment: item.quantity } },
      });
    }

    // Delete guest cart
    await db.cart.delete({ where: { id: guestCart.id } });

    const summary = await getCartSummary(userCart.id);
    return ok(summary);
  } catch (e) {
    console.error("[cart/merge] POST error", e);
    return Err.internal();
  }
}
