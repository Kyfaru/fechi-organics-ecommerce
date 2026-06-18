/**
 * POST /api/payments/mpesa/initiate
 *
 * Creates an order from the authenticated user's cart and initiates an M-Pesa
 * STK push to their phone. On success the cart is cleared and the orderId is
 * returned so the payment page can poll /api/payments/status/[orderId].
 *
 * Requires an active session. Guests cannot use this endpoint.
 */

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { resolveBranchForCounty } from "@/lib/payments/branch-resolver";
import { getDarajaToken } from "@/lib/payments/mpesa/daraja-client";
import { initiateSTKPush } from "@/lib/payments/mpesa/stk-push";

// ---------------------------------------------------------------------------
// Delivery fees in KES-cents (matches the schema convention of integer cents)
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
  phone: z.string().min(9),
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

  const { phone, deliveryData } = parsed;

  try {
    // 3. Load cart and validate it is not empty
    const cart = await db.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, priceKes: true, isActive: true, stock: true },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return err("CART_EMPTY", "Your cart is empty", 400);
    }

    // Filter out items where the product is no longer active
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
    const totalKes = totalCents / 100; // Convert cents to whole KES for Daraja

    // 5. Resolve branch — use provided branchId or look up by county
    let branch: Awaited<ReturnType<typeof db.branch.findUnique>> | null = null;

    if (deliveryData.branchId) {
      branch = await db.branch.findUnique({
        where: { id: deliveryData.branchId, isActive: true },
      });
    }

    if (!branch) {
      const resolved = await resolveBranchForCounty(deliveryData.county);
      if (resolved) {
        branch = await db.branch.findUnique({ where: { id: resolved.id } });
      }
    }

    if (!branch) {
      return err("NO_BRANCH", "No active M-Pesa branch available", 503);
    }

    // 6. Create order
    const order = await db.order.create({
      data: {
        userId,
        subtotalKes: subtotalCents,
        deliveryKes: deliveryCents,
        totalKes: totalCents,
        paymentStatus: "PENDING",
        status: "PENDING",
        deliveryType: deliveryData.deliveryType,
        deliveryPhone: deliveryData.phone,
        deliveryAddress: deliveryData.address ?? null,
        deliveryCity: deliveryData.city ?? null,
        deliveryCounty: deliveryData.county,
        branchId: branch.id,
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

    // 7. Create transaction record (PENDING until callback arrives)
    const transaction = await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "MPESA",
        branchId: branch.id,
        amount: totalCents,
        status: "PENDING",
      },
    });

    // 8. Fetch Daraja token then initiate STK push
    await getDarajaToken(branch); // warm-up / validate credentials early

    const callbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}/api/payments/mpesa/callback`;

    const stkResponse = await initiateSTKPush({
      branch,
      phone,
      amountKes: totalKes,
      orderId: order.id,
      callbackUrl,
    });

    // 9. Persist CheckoutRequestID so the callback can look up the transaction
    await db.transaction.update({
      where: { id: transaction.id },
      data: { checkoutRequestId: stkResponse.CheckoutRequestID },
    });

    // 10. Clear the cart — order has been captured
    await db.cartItem.deleteMany({ where: { cartId: cart.id } });

    console.info(
      `[mpesa/initiate] STK push initiated — order=${order.id} checkout=${stkResponse.CheckoutRequestID}`,
    );

    return ok({ orderId: order.id });
  } catch (e) {
    console.error("[mpesa/initiate] POST error", e);
    return Err.internal();
  }
}
