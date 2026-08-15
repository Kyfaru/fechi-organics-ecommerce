import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveCart, getCartSummary } from "@/lib/cart";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";
import { readUtmCookie } from "@/lib/attribution";

const AddSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
  variantId: z.string().optional(),
  variantLabel: z.string().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = AddSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { productId, quantity, variantId, variantLabel } = parsed.data;

    // Verify product exists and is in stock
    const product = await db.product.findUnique({ where: { id: productId, isActive: true } });
    if (!product) return Err.notFound("Product");

    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;

    const { cartId, isNew } = await resolveCart(userId, readUtmCookie(req)?.source);

    // Prisma's compound-unique where-input doesn't accept `null` for a
    // nullable member field, so a null variantId (sizes-mode/no-variant
    // products) needs a plain findFirst + create/update instead of upsert.
    const existingItem = await db.cartItem.findFirst({
      where: { cartId, productId, variantId: variantId ?? null },
      select: { id: true },
    });
    if (existingItem) {
      await db.cartItem.update({ where: { id: existingItem.id }, data: { quantity: { increment: quantity } } });
    } else {
      await db.cartItem.create({ data: { cartId, productId, quantity, variantId, variantLabel } });
    }

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
    reportError(e, { route: "POST /api/cart/items" });
    return Err.internal();
  }
}
