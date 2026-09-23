/**
 * POST /api/admin/2fa/method
 * Independently enables/disables an email or SMS OTP channel for the
 * signed-in admin, mirroring app/api/account/2fa/method/route.ts's
 * user.twoFaEmail/twoFaPhone booleans instead of the old exclusive
 * adminProfile.twoFaMethod string — both channels (plus TOTP) can be on
 * at once.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireStaffSession } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import { logActivity } from "@/lib/admin-activity";

const BodySchema = z.object({
  channel: z.enum(["email", "sms"]),
  enable: z.boolean(),
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

    const { channel, enable, phone } = parsed.data;
    if (channel === "sms" && enable && !phone?.trim()) {
      return Err.validation("Phone number is required to enable SMS OTP");
    }

    const profile = await db.adminProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    const data =
      channel === "sms"
        ? { twoFaPhone: enable, ...(enable && phone ? { phone: phone.trim() } : {}) }
        : { twoFaEmail: enable };

    await db.user.update({ where: { id: session.user.id }, data });

    if (profile) {
      logActivity(
        profile.id,
        `${enable ? "Enabled" : "Disabled"} ${channel === "sms" ? "SMS" : "Email"} OTP`,
        "profile",
        profile.id,
        req,
        { channel, enable },
        "WARNING",
      );
    }

    console.info("[admin/2fa/method] POST — userId", session.user.id, "→", channel, enable);
    return ok({ channel, enable });
  } catch (e) {
    console.error("[admin/2fa/method] POST error", e);
    reportError(e, { route: "POST /api/admin/2fa/method", tags: { flow: "admin-2fa" } });
    return Err.internal();
  }
}
