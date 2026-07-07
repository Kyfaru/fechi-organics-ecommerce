import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyResetToken } from "@/lib/password-reset";
import { getRedis } from "@/lib/redis";
import { Argon2id } from "oslo/password";
import { assertTrustedOrigin } from "@/lib/origin-check";

// POST /api/admin/reset-password — consume a reset credential and update the password.
//
// This route serves TWO distinct callers with two distinct credential types —
// do not remove either branch:
//   1. `token` (JWT, via lib/password-reset.ts) — the staff-invite/admin-action
//      flow: an already-authenticated admin resets ANOTHER staff member's
//      password (app/api/admin/staff/send-reset/route.ts emails a link to
//      /admin/reset-password?token=...). That route is intentionally untouched
//      and still needs this branch.
//   2. `resetAuth` (opaque Redis token, via app/api/admin/forgot-password/verify)
//      — the admin's own self-service "I forgot my password" OTP flow.
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const { token, resetAuth, newPassword } = await req.json().catch(() => ({}));

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: { message: "Invalid request" } }, { status: 400 });
  }

  let userId: string | null = null;

  if (typeof token === "string" && token) {
    // Staff-invite / admin-action branch — unchanged JWT verification.
    const result = await verifyResetToken(token);
    if (!result) {
      return NextResponse.json({ ok: false, error: { message: "Reset link is invalid or expired" } }, { status: 400 });
    }
    userId = result.userId;
  } else if (typeof resetAuth === "string" && resetAuth) {
    // Self-service OTP branch — single-use, atomic consume via getdel.
    const redis = getRedis();
    const value = await redis.getdel(`admin:pwreset:auth:${resetAuth}`);
    if (!value || typeof value !== "string") {
      return NextResponse.json(
        { ok: false, error: { message: "Reset session expired or already used. Please start over." } },
        { status: 400 }
      );
    }
    userId = value;
  } else {
    return NextResponse.json({ ok: false, error: { message: "Invalid request" } }, { status: 400 });
  }

  const hashed = await new Argon2id().hash(newPassword);

  await db.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: hashed },
  });

  // Clear force-change flag if set
  await db.user.update({
    where: { id: userId },
    data: { mustChangePassword: false },
  });

  return NextResponse.json({ ok: true });
}
