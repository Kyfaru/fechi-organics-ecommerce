import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { ok, Err } from "@/lib/api";
import { calculateDeliveryPricing } from "@/lib/delivery-pricing";

const BodySchema = z.object({
  country: z.string().min(2),
  county: z.string().optional().nullable(),
  zoneId: z.string().optional().nullable(),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]),
});

export async function POST(req: NextRequest) {
  await connection();
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

  try {
    return ok(await calculateDeliveryPricing(parsed.data));
  } catch (e) {
    console.error("[delivery-pricing] POST error", e);
    return Err.internal();
  }
}
