import { cookies } from "next/headers";
import { db } from "./db";
import { r2PublicUrl } from "./r2";
import type { NextRequest } from "next/server";

export type CartLine = {
  cartItemId: string;
  productId: string;
  slug: string;
  name: string;
  variantLabel: string | null;
  primaryImageUrl: string;
  priceKes: number;
  quantity: number;
  lineTotalKes: number;
};

export type CartSummary = {
  cartId: string;
  items: CartLine[];
  subtotalKes: number;
  itemCount: number;
};

/** Resolve or create a cart for the current request.
 *  Logged-in users → user cart. Guests → cookie-token cart. */
export async function resolveCart(
  userId: string | null
): Promise<{ cartId: string; isNew: boolean }> {
  if (userId) {
    const existing = await db.cart.findUnique({ where: { userId } });
    if (existing) return { cartId: existing.id, isNew: false };
    const created = await db.cart.create({ data: { userId } });
    return { cartId: created.id, isNew: true };
  }

  // Guest: read existing token from cookie
  const cookieStore = await cookies();
  const token = cookieStore.get("fechi_cart")?.value;
  if (token) {
    const existing = await db.cart.findUnique({ where: { token } });
    if (existing) return { cartId: existing.id, isNew: false };
  }

  // Create guest cart with new token
  const newToken = crypto.randomUUID();
  const created = await db.cart.create({ data: { token: newToken } });
  return { cartId: created.id, isNew: true };
}

/** Return a serialized cart summary. */
export async function getCartSummary(cartId: string): Promise<CartSummary> {
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          product: {
            include: { images: { where: { isPrimary: true }, take: 1 } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!cart) return { cartId, items: [], subtotalKes: 0, itemCount: 0 };

  const items: CartLine[] = cart.items.map((ci: typeof cart.items[number]) => {
    const img = ci.product.images[0];
    return {
      cartItemId: ci.id,
      productId: ci.productId,
      slug: ci.product.slug,
      name: ci.product.name,
      variantLabel: ci.product.variantLabel,
      primaryImageUrl: img ? r2PublicUrl(img.objectKey) : "/img/placeholder.png",
      priceKes: ci.product.priceKes,
      quantity: ci.quantity,
      lineTotalKes: ci.product.priceKes * ci.quantity,
    };
  });

  const subtotalKes = items.reduce((s, i) => s + i.lineTotalKes, 0);
  return { cartId, items, subtotalKes, itemCount: items.reduce((s, i) => s + i.quantity, 0) };
}

/** Read guest cart token cookie value from a request (Edge-compatible). */
export function getGuestToken(req: NextRequest): string | null {
  return req.cookies.get("fechi_cart")?.value ?? null;
}
