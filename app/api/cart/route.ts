import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { resolveCart, getCartSummary } from "@/lib/cart";
import { ok, Err } from "@/lib/api";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;

    const { cartId, isNew } = await resolveCart(userId);
    const summary = await getCartSummary(cartId);

    const res = ok(summary);
    // Set guest cart cookie if a new one was created
    if (isNew && !userId) {
      const cart = summary;
      const token = crypto.randomUUID(); // already created in resolveCart, need to read it
      // We'll set the cookie response header using the NextResponse approach
      const resp = NextResponse.json({ ok: true, data: summary });
      // Read the cart to get its token
      const { db } = await import("@/lib/db");
      const cartRow = await db.cart.findUnique({ where: { id: cartId } });
      if (cartRow?.token) {
        resp.cookies.set("fechi_cart", cartRow.token, {
          maxAge: 30 * 24 * 3600,
          sameSite: "lax",
          httpOnly: false,
          path: "/",
        });
      }
      return resp;
    }

    return res;
  } catch (e) {
    console.error("[cart] GET error", e);
    return Err.internal();
  }
}
