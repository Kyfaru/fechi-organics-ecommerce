import { NextRequest } from "next/server";
import { connection } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ok, Err } from "@/lib/api";
import { resolvePromo } from "@/lib/promo";
import { assertTrustedOrigin } from "@/lib/origin-check";

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : null;
    const subtotalKes = typeof body?.subtotalKes === "number" ? body.subtotalKes : 0;

    if (!code) return Err.validation("Coupon code is required");

    // Optional — admin-side previews (in-store order builder) may not have a
    // customer session at all, so the per-user reuse limit is skipped there.
    const session = await auth.api.getSession({ headers: await headers() });
    const { discountKes, deliveryFree } = await resolvePromo(code, subtotalKes, session?.user?.id);
    return ok({ valid: true, discountKes, freeShipping: deliveryFree, message: "Coupon applied!" });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[promo/validate]", e);
    return Err.internal();
  }
}
