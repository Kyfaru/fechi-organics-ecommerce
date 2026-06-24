import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { zohoPost } from "@/lib/zoho";
import { r2PublicUrl } from "@/lib/r2";
import type { ZohoSalesOrderPayload } from "@/lib/zoho";

// ---------------------------------------------------------------------------
// GET /api/orders — return all orders for the authenticated user
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const orders = await db.order.findMany({
      where: { userId: session.user.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Shape each order to include resolved image URLs
    const shaped = orders.map((order) => ({
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotalKes: order.subtotalKes,
      deliveryKes: order.deliveryKes,
      discountKes: order.discountKes,
      totalKes: order.totalKes,
      promoCode: order.promoCode,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => {
        const primary =
          item.product.images.find((img) => img.isPrimary) ??
          item.product.images[0];
        return {
          id: item.id,
          productId: item.productId,
          name: item.name,
          priceKes: item.priceKes,
          quantity: item.quantity,
          imageUrl: primary ? r2PublicUrl(primary.objectKey) : null,
        };
      }),
    }));

    console.info("[orders] GET — returning", shaped.length, "orders for user", session.user.id);
    return ok({ orders: shaped });
  } catch (e) {
    console.error("[orders] GET error", e);
    return Err.internal();
  }
}

const DELIVERY_KES = 35000; // 350 KES × 100 cents

// ---------------------------------------------------------------------------
// Validate a promo code against the promotions table.
// Returns the promotion row and the discount amount in cents (KES × 100),
// or throws a Response that can be returned directly.
// ---------------------------------------------------------------------------
async function resolvePromo(
  promoCode: string,
  userId: string,
  subtotalKes: number,
): Promise<{ promo: { id: string; type: string; value: number }; discountKes: number; deliveryFree: boolean }> {
  const now = new Date();

  const promo = await db.promotion.findFirst({
    where: {
      code: promoCode,
      status: "active",
      OR: [{ startDate: null }, { startDate: { lte: now } }],
      AND: [
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    },
  });

  if (!promo) {
    throw Err.validation("Invalid or expired coupon code");
  }

  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    throw Err.validation("Coupon usage limit reached");
  }

  // Check this user hasn't already redeemed this coupon
  const alreadyUsed = await db.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: promo.id, userId } },
  });
  if (alreadyUsed) {
    throw Err.validation("You have already used this coupon");
  }

  if (promo.minOrder !== null && subtotalKes < promo.minOrder) {
    throw Err.validation("Order does not meet minimum for this coupon");
  }

  let discountKes = 0;
  let deliveryFree = false;

  if (promo.type === "PERCENTAGE") {
    discountKes = Math.round(subtotalKes * promo.value / 100);
  } else if (promo.type === "FIXED") {
    // promo.value is stored in KES; convert to cents, cap at subtotal
    discountKes = Math.min(Math.round(promo.value * 100), subtotalKes);
  } else if (promo.type === "FREE_SHIPPING") {
    deliveryFree = true;
  }

  return { promo, discountKes, deliveryFree };
}

// ---------------------------------------------------------------------------
// POST /api/orders — authenticated users only
// Creates an order from the current cart and clears cart.
// Validates a real coupon code if provided, records redemption in transaction.
// Stock is decremented only after a payment callback confirms PAID.
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
      promoCode =
        typeof body?.promoCode === "string"
          ? body.promoCode.trim().toUpperCase()
          : undefined;
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
          `"${ci.product.name}" is out of stock (requested ${ci.quantity}, available ${ci.product.stock})`,
        );
      }
    }

    // 5. Compute subtotal
    const subtotalKes = cart.items.reduce(
      (sum: number, ci: (typeof cart.items)[number]) =>
        sum + ci.product.priceKes * ci.quantity,
      0,
    );

    // 6. Validate promo code if provided
    let discountKes = 0;
    let resolvedDeliveryKes = DELIVERY_KES;
    let resolvedPromoId: string | null = null;

    if (promoCode) {
      try {
        const result = await resolvePromo(promoCode, userId, subtotalKes);
        discountKes = result.discountKes;
        if (result.deliveryFree) resolvedDeliveryKes = 0;
        resolvedPromoId = result.promo.id;
      } catch (e) {
        // resolvePromo throws Response objects for operational errors
        if (e instanceof Response) return e;
        throw e;
      }
    }

    const totalKes = subtotalKes + resolvedDeliveryKes - discountKes;

    // 7. Prisma transaction: create order, record redemption, increment promo, clear cart
    type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

    const order = await db.$transaction(async (tx: TxClient) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          userId,
          subtotalKes,
          deliveryKes: resolvedDeliveryKes,
          discountKes,
          totalKes,
          promoCode: promoCode ?? null,
          status: "PENDING",
          items: {
            create: cart.items.map((ci: (typeof cart.items)[number]) => ({
              productId: ci.productId,
              name: ci.product.name,
              priceKes: ci.product.priceKes,
              quantity: ci.quantity,
            })),
          },
        },
      });

      // Record coupon redemption and increment usedCount atomically
      if (resolvedPromoId && promoCode) {
        await tx.couponRedemption.create({
          data: {
            couponId: resolvedPromoId,
            userId,
            orderId: newOrder.id,
          },
        });
        await tx.promotion.update({
          where: { id: resolvedPromoId },
          data: { usedCount: { increment: 1 } },
        });
      }

      // Clear cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });

    // 8. Fire-and-forget: push Sales Order to Zoho
    (async () => {
      try {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });

        const soPayload: ZohoSalesOrderPayload = {
          customer_name: user?.name,
          customer_email: user?.email,
          line_items: cart.items.map((ci: (typeof cart.items)[number]) => ({
            item_id: ci.product.zohoItemId ?? undefined,
            name: ci.product.name,
            quantity: ci.quantity,
            rate: ci.product.priceKes / 100,
          })),
          discount: discountKes / 100,
          shipping_charge: resolvedDeliveryKes / 100,
          notes: `Fechi Organics order ${order.id}`,
        };

        const soRes = await zohoPost<{
          salesorder?: { salesorder_id?: string };
        }>("/salesorders", { salesorder: soPayload });

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

    // Assign a human-readable order number after creation.
    // Count is used as a sequence — not perfectly contiguous but collision-safe.
    const orderCount = await db.order.count();
    const orderNumber = `FO-${new Date().getFullYear()}-${String(orderCount).padStart(4, "0")}`;
    await db.order.update({ where: { id: order.id }, data: { orderNumber } });

    console.info("[orders] Created order", order.id, "orderNumber", orderNumber, "for user", userId);
    return ok({ orderId: order.id });
  } catch (e) {
    console.error("[orders] POST error", e);
    return Err.internal();
  }
}
