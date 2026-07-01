import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";
import { resolveBranchForCounty } from "@/lib/payments/branch-resolver";
import { resolvePromo } from "@/lib/promo";
import { assertTrustedOrigin } from "@/lib/origin-check";

const DeliverySchema = z.object({
  fullName: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  country: z.string().min(2).default("KE"),
  countryName: z.string().optional(),
  county: z.string().optional().default(""),
  state: z.string().optional(),
  zoneId: z.string().optional().nullable(),
  deliveryZone: z.string().optional().nullable(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]),
  branchId: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
  promoCode: z.string().optional().nullable(),
}).strict();

const BodySchema = z.object({
  deliveryData: DeliverySchema,
  paymentMethod: z.enum(["mpesa", "card"]),
  outcome: z.enum(["success", "failed"]).default("success"),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

  const { deliveryData, paymentMethod, outcome } = parsed.data;

  try {
    const cart = await db.cart.findUnique({
      where: { userId: session.user.id },
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

    if (!cart || cart.items.length === 0) return err("CART_EMPTY", "Your cart is empty", 400);

    const activeItems = cart.items.filter((item) => item.product.isActive);
    if (!activeItems.length) return err("CART_EMPTY", "No active products in cart", 400);

    for (const item of activeItems) {
      if (item.product.stock < item.quantity) {
        return Err.validation(`${item.product.name} is out of stock`);
      }
    }

    const subtotalKes = activeItems.reduce((sum, item) => sum + item.product.priceKes * item.quantity, 0);
    const pricing = await calculateDeliveryPricing({
      country: deliveryData.country,
      county: deliveryData.county,
      zoneId: deliveryData.zoneId,
      deliveryType: deliveryData.deliveryType,
    });
    const promoCode = deliveryData.promoCode?.trim().toUpperCase() || null;
    let discountKes = 0;
    let deliveryFeeKes = pricing.feeKes;
    if (promoCode) {
      try {
        const r = await resolvePromo(promoCode, subtotalKes);
        discountKes = r.discountKes;
        if (r.deliveryFree) deliveryFeeKes = 0;
      } catch { /* invalid/expired — discount stays 0 */ }
    }
    const totalKes = Math.max(0, subtotalKes + deliveryFeeKes - discountKes);

    const branch = deliveryData.branchId
      ? await db.branch.findUnique({ where: { id: deliveryData.branchId, isActive: true } })
      : await resolveBranchForCounty(deliveryData.county || "Nairobi", { zoneId: deliveryData.zoneId });

    const order = await db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: session.user.id,
          subtotalKes,
          deliveryKes: deliveryFeeKes,
          discountKes,
          totalKes,
          promoCode,
          status: outcome === "success" ? "CONFIRMED" : "PENDING",
          paymentStatus: outcome === "success" ? "PAID" : "FAILED",
          isInternational: deliveryData.country.toUpperCase() !== "KE",
          deliveryType: deliveryData.deliveryType,
          deliveryPhone: deliveryData.phone,
          deliveryAddress: deliveryData.address ?? null,
          deliveryCity: deliveryData.city ?? deliveryData.state ?? null,
          deliveryCounty: deliveryData.county || deliveryData.country,
          deliveryZone: deliveryData.deliveryZone ?? pricing.label,
          branchId: branch?.id ?? null,
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

      await tx.transaction.create({
        data: {
          orderId: created.id,
          branchId: branch?.id ?? null,
          provider: paymentMethod === "mpesa" ? "MPESA" : "PAYSTACK",
          amount: totalKes,
          status: outcome === "success" ? "SUCCESS" : "FAILED",
          failureReason: outcome === "failed" ? "Mock checkout failed" : null,
          rawRequestPayload: { paymentMethod, outcome },
        },
      });

      if (outcome === "success") {
        for (const item of activeItems) {
          await tx.product.update({
            where: { id: item.product.id },
            data: { stock: { decrement: item.quantity } },
          });
        }
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      return created;
    });

    return ok({ orderId: order.id, paymentStatus: order.paymentStatus });
  } catch (e) {
    console.error("[mock-checkout] POST error", e);
    return Err.internal();
  }
}
