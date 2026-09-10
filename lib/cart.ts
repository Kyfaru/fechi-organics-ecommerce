import { cookies } from "next/headers";
import { db } from "./db";
import { r2PublicUrl } from "./r2";
import type { NextRequest } from "next/server";

export type CartLine = {
  cartItemId: string;
  productId: string;
  slug: string;
  name: string;
  // Static descriptive subtitle from the product itself (e.g. "250ml"),
  // unrelated to the customer's own variant pick below.
  variantLabel: string | null;
  // The color/flavour/etc. the customer selected, if this product is in
  // variants mode — denormalized onto cartItem at add-to-cart time.
  selectedVariantLabel: string | null;
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
 *  Logged-in users → user cart. Guests → cookie-token cart.
 *  `utmSource`, if given, is stamped only when a cart is newly created — the
 *  conversion-rate denominator for the Reports social-channel section. */
export async function resolveCart(
  userId: string | null,
  utmSource?: string | null,
): Promise<{ cartId: string; isNew: boolean }> {
  if (userId) {
    const existing = await db.cart.findUnique({ where: { userId } });
    if (existing) return { cartId: existing.id, isNew: false };
    const created = await db.cart.create({ data: { userId, utmSource: utmSource ?? null } });
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
  const created = await db.cart.create({ data: { token: newToken, utmSource: utmSource ?? null } });
  return { cartId: created.id, isNew: true };
}

// Return a serialized cart summary. */
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
      selectedVariantLabel: ci.variantLabel,
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
