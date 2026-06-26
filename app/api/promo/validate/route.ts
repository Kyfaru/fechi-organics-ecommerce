import { NextRequest } from "next/server";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { resolvePromo } from "@/lib/promo";

export async function POST(req: NextRequest) {
  await connection();
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : null;
    const subtotalKes = typeof body?.subtotalKes === "number" ? body.subtotalKes : 0;

    if (!code) return Err.validation("Coupon code is required");

    const { discountKes, deliveryFree } = await resolvePromo(code, subtotalKes);
    return ok({ valid: true, discountKes, freeShipping: deliveryFree, message: "Coupon applied!" });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[promo/validate]", e);
    return Err.internal();
  }
}
