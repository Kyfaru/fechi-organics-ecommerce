import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyResetToken } from "@/lib/password-reset";
import { getRedis } from "@/lib/redis";
import { Argon2id } from "oslo/password";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { checkPasswordChangeAllowed, ADMIN_COOLDOWN_DAYS } from "@/lib/password-policy";

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
    // Staff-invite / admin-action branch — JWT verification.
    const result = await verifyResetToken(token);
    if (!result.ok) {
      const status = result.reason === "expired" ? 410 : 400;
      const message =
        result.reason === "expired" ? "This reset link has expired." : "This reset link is invalid.";
      return NextResponse.json({ ok: false, error: { code: result.reason.toUpperCase(), message } }, { status });
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

    // Cooldown only applies to self-service resets — a super admin forcing a
    // reset via the token branch is an authorized override, not throttled.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordChanges: true, lastPasswordChange: true, createdAt: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: { message: "Account not found." } }, { status: 404 });
    }
    const check = checkPasswordChangeAllowed(user, ADMIN_COOLDOWN_DAYS);
    if (!check.allowed) {
      return NextResponse.json({ ok: false, error: { code: check.reason, ...check } }, { status: 429 });
    }
  } else {
    return NextResponse.json({ ok: false, error: { message: "Invalid request" } }, { status: 400 });
  }

  const hashed = await new Argon2id().hash(newPassword);

  await db.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: hashed },
  });

  // Clear force-change flag, and record the change so future cooldown
  // checks (either branch) have an accurate lastPasswordChange/count.
  await db.user.update({
    where: { id: userId },
    data: { mustChangePassword: false, passwordChanges: { increment: 1 }, lastPasswordChange: new Date() },
  });

  return NextResponse.json({ ok: true });
}
