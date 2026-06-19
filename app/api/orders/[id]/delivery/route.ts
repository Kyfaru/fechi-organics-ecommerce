import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";

const BodySchema = z.object({
  country: z.string().min(2),
  county: z.string().optional().nullable(),
  zoneId: z.string().optional().nullable(),
  deliveryZone: z.string().optional().nullable(),
  deliveryAddress: z.string().optional().nullable(),
  deliveryCity: z.string().optional().nullable(),
  deliveryPhone: z.string().min(7),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]),
  branchId: z.string().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

  try {
    const order = await db.order.findUnique({ where: { id }, select: { userId: true, subtotalKes: true, discountKes: true } });
    if (!order) return Err.notFound("Order");
    if (order.userId !== session.user.id) return Err.forbidden();

    const price = await calculateDeliveryPricing({
      country: parsed.data.country,
      county: parsed.data.county,
      zoneId: parsed.data.zoneId,
      deliveryType: parsed.data.deliveryType,
    });

    const updated = await db.order.update({
      where: { id },
      data: {
        deliveryAddress: parsed.data.deliveryAddress ?? null,
        deliveryCity: parsed.data.deliveryCity ?? null,
        deliveryCounty: parsed.data.county ?? parsed.data.country,
        deliveryZone: parsed.data.deliveryZone ?? null,
        deliveryPhone: parsed.data.deliveryPhone,
        deliveryType: parsed.data.deliveryType,
        branchId: parsed.data.branchId ?? null,
        isInternational: parsed.data.country.toUpperCase() !== "KE",
        deliveryKes: price.feeKes,
        totalKes: order.subtotalKes + price.feeKes - order.discountKes,
      },
      select: { id: true, deliveryKes: true, totalKes: true },
    });

    return ok({ order: updated });
  } catch (e) {
    console.error("[orders/:id/delivery] PATCH error", e);
    return Err.internal();
  }
}
