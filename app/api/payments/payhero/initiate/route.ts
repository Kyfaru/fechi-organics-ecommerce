/**
 * POST /api/payments/payhero/initiate
 *
 * Creates an order from the authenticated user's cart and initiates a PayHero
 * card payment. No branch resolution is needed — PayHero is a single global
 * provider. Returns a checkout URL that the frontend redirects the user to.
 *
 * Requires an active session.
 */

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { createPayHeroPayment } from "@/lib/payments/payhero/payhero-client";

// ---------------------------------------------------------------------------
// Delivery fees in KES-cents
// ---------------------------------------------------------------------------
const PICKUP_FEE_CENTS = 13000;   // KES 130
const DELIVERY_FEE_CENTS = 35000; // KES 350

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
const deliveryDataSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(9),
  email: z.string().email().optional(),
  county: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]),
  branchId: z.string().optional(),
  branchName: z.string().optional(),
});

const bodySchema = z.object({
  deliveryData: deliveryDataSchema,
});

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const userId = session.user.id;

  // 2. Parse and validate body
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    parsed = bodySchema.parse(raw);
  } catch {
    return Err.validation("Invalid request body");
  }

  const { deliveryData } = parsed;

  try {
    // 3. Load cart and validate it is not empty
    const cart = await db.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, priceKes: true, isActive: true },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return err("CART_EMPTY", "Your cart is empty", 400);
    }

    const activeItems = cart.items.filter((item) => item.product.isActive);
    if (activeItems.length === 0) {
      return err("CART_EMPTY", "No active products in cart", 400);
    }

    // 4. Calculate totals
    const subtotalCents = activeItems.reduce(
      (sum, item) => sum + item.product.priceKes * item.quantity,
      0,
    );
    const deliveryCents =
      deliveryData.deliveryType === "PICKUP" ? PICKUP_FEE_CENTS : DELIVERY_FEE_CENTS;
    const totalCents = subtotalCents + deliveryCents;
    // PayHero expects whole KES, not cents
    const totalKes = totalCents / 100;

    // 5. Create order (no branch — PayHero is international / card)
    const order = await db.order.create({
      data: {
        userId,
        subtotalKes: subtotalCents,
        deliveryKes: deliveryCents,
        totalKes: totalCents,
        paymentStatus: "PENDING",
        status: "PENDING",
        isInternational: true,
        deliveryType: deliveryData.deliveryType,
        deliveryPhone: deliveryData.phone,
        deliveryAddress: deliveryData.address ?? null,
        deliveryCity: deliveryData.city ?? null,
        deliveryCounty: deliveryData.county,
        items: {
          create: activeItems.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            priceKes: item.product.priceKes,
            quantity: item.quantity,
          })),
        },
      },
    });

    // 6. Create transaction record
    const transaction = await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "PAYHERO",
        amount: totalCents,
        status: "PENDING",
      },
    });

    // 7. Initiate PayHero payment
    const channelId = parseInt(process.env.PAYHERO_CHANNEL_ID ?? "0", 10);
    const callbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}/api/payments/payhero/callback`;

    const payheroResponse = await createPayHeroPayment({
      amount: totalKes,
      phone_number: deliveryData.phone,
      channel_id: channelId,
      provider: "c2b",
      external_reference: order.id,
      callback_url: callbackUrl,
      email: deliveryData.email,
    });

    // 8. Persist the PayHero reference for callback lookup
    const payheroReference = payheroResponse.reference ?? order.id;
    await db.transaction.update({
      where: { id: transaction.id },
      data: {
        payheroReference,
        rawRequestPayload: payheroResponse as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    // 9. Clear the cart
    await db.cartItem.deleteMany({ where: { cartId: cart.id } });

    console.info(
      `[payhero/initiate] Payment initiated — order=${order.id} ref=${payheroReference}`,
    );

    return ok({
      orderId: order.id,
      checkoutUrl: payheroResponse.checkout_url ?? null,
      redirectUrl: payheroResponse.checkout_url ?? null,
    });
  } catch (e) {
    console.error("[payhero/initiate] POST error", e);
    return Err.internal();
  }
}
