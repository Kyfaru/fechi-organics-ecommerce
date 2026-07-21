/**
 * POST /api/admin/2fa/method
 * Saves the preferred 2FA method (totp | email | sms) to the admin's profile.
 * Also stores phone number when switching to SMS.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireStaffSession } from "@/lib/require-permission";

const BodySchema = z.object({
  method: z.enum(["totp", "email", "sms"]),
  phone: z.string().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requireStaffSession(req);
    if (denied) return denied;

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { method, phone } = parsed.data;

    // Update the adminProfile twoFaMethod
    await db.adminProfile.update({
      where: { userId: session.user.id },
      data: { twoFaMethod: method },
    });

    // If switching to SMS, also persist the phone on the user record
    if (method === "sms" && phone) {
      await db.user.update({
        where: { id: session.user.id },
        data: { phone: phone.trim() },
      });
    }

    console.info("[admin/2fa/method] POST — userId", session.user.id, "→ method", method);
    return ok({ method });
  } catch (e) {
    console.error("[admin/2fa/method] POST error", e);
    return Err.internal(e);
  }
}
