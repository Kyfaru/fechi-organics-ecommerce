import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { zohoPost } from "@/lib/zoho";
import type { ZohoSalesOrderPayload } from "@/lib/zoho";

const DELIVERY_KES = 35000; // 350 KES × 100 cents

// ---------------------------------------------------------------------------
// POST /api/orders — authenticated users only
// Creates an order from the current cart, decrements stock, clears cart.
// Fire-and-forgets a Zoho Sales Order after commit.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  await connection();
  try {
    // 1. Require session
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const userId = session.user.id;

    // 2. Parse optional promo code from body
    let promoCode: string | undefined;
    try {
      const body = await req.json();
      promoCode = typeof body?.promoCode === "string" ? body.promoCode.trim().toUpperCase() : undefined;
    } catch {
      // body is optional
    }

    // 3. Load cart with items
    const cart = await db.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return Err.validation("Cart is empty");
    }

    // 4. Validate stock
    for (const ci of cart.items) {
      if (ci.product.stock < ci.quantity) {
        return Err.validation(
          `"${ci.product.name}" is out of stock (requested ${ci.quantity}, available ${ci.product.stock})`
        );
      }
    }

    // 5. Compute pricing
    const subtotalKes = cart.items.reduce(
  (sum: number, ci: typeof cart.items[number]) => sum + ci.product.priceKes * ci.quantity,
  0
);

    let discountKes = 0;
    if (promoCode === "FECHI10") {
      discountKes = Math.round(subtotalKes * 0.1);
    } else if (promoCode === "NEWUSER") {
      discountKes = 50000; // 500 KES
    }

    const totalKes = subtotalKes + DELIVERY_KES - discountKes;

    // 6. Prisma transaction: create order, decrement stock, clear cart
    type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

    const order = await db.$transaction(async (tx: TxClient) =>{
      // Create order
      const newOrder = await tx.order.create({
        data: {
          userId,
          subtotalKes,
          deliveryKes: DELIVERY_KES,
          discountKes,
          totalKes,
          promoCode: promoCode ?? null,
          status: "PENDING",
          items: {
  create: cart.items.map((ci: typeof cart.items[number]) => ({
    productId: ci.productId,
    name: ci.product.name,
    priceKes: ci.product.priceKes,
              quantity: ci.quantity,
            })),
          },
        },
      });

      // Decrement stock for each item
      for (const ci of cart.items) {
        await tx.product.update({
          where: { id: ci.productId },
          data: { stock: { decrement: ci.quantity } },
        });
      }

      // Clear cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });

    // 7. Fire-and-forget: push Sales Order to Zoho
    (async () => {
      try {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });

        const soPayload: ZohoSalesOrderPayload = {
          customer_name: user?.name,
          customer_email: user?.email,
          line_items: cart.items.map((ci) => ({
            item_id: ci.product.zohoItemId ?? undefined,
            name: ci.product.name,
            quantity: ci.quantity,
            rate: ci.product.priceKes / 100,
          })),
          discount: discountKes / 100,
          shipping_charge: DELIVERY_KES / 100,
          notes: `Fechi Organics order ${order.id}`,
        };

        const soRes = await zohoPost<{ salesorder?: { salesorder_id?: string } }>(
          "/salesorders",
          { salesorder: soPayload }
        );

        if (soRes?.salesorder?.salesorder_id) {
          await db.order.update({
            where: { id: order.id },
            data: { zohoSoId: soRes.salesorder.salesorder_id },
          });
        }
      } catch (e) {
        console.error("[orders] Zoho SO push failed for order", order.id, e);
      }
    })();

    console.info("[orders] Created order", order.id, "for user", userId);
    return ok({ orderId: order.id });
  } catch (e) {
    console.error("[orders] POST error", e);
    return Err.internal();
  }
}
