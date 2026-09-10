/**
 * POST /api/account/2fa/method
 * Marks email or SMS as an enabled 2FA channel for the signed-in customer —
 * called during first-time login method-choice setup (mirrors
 * app/api/admin/2fa/method/route.ts, but a customer can have multiple
 * channels enabled at once via independent user.twoFaEmail/twoFaPhone
 * booleans, instead of one exclusive adminProfile.twoFaMethod string).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";

const BodySchema = z.object({
  method: z.enum(["email", "sms"]),
  phone: z.string().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
    const { method, phone } = parsed.data;

    const data =
      method === "sms"
        ? { twoFaPhone: true, ...(phone ? { phone: phone.trim() } : {}) }
        : { twoFaEmail: true };

    await db.user.update({ where: { id: session.user.id }, data });

    console.info("[account/2fa/method] POST — userId", session.user.id, "→ method", method);
    return ok({ method });
  } catch (e) {
    console.error("[account/2fa/method] POST error", e);
    reportError(e, { route: "POST /api/account/2fa/method", tags: { flow: "account-2fa" } });
    return Err.internal();
  }
}
