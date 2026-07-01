import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyResetToken } from "@/lib/password-reset";
import { Argon2id } from "oslo/password";
import { assertTrustedOrigin } from "@/lib/origin-check";

// POST /api/admin/reset-password — consume a reset token and update the password.
// Used by both admin-initiated resets (link sent via staff panel) and the admin
// forgot-password flow on /admin/reset-password.
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const { token, newPassword } = await req.json().catch(() => ({}));

  if (!token || !newPassword || newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: { message: "Invalid request" } }, { status: 400 });
  }

  const result = await verifyResetToken(token);
  if (!result) {
    return NextResponse.json({ ok: false, error: { message: "Reset link is invalid or expired" } }, { status: 400 });
  }

  const hashed = await new Argon2id().hash(newPassword);

  await db.account.updateMany({
    where: { userId: result.userId, providerId: "credential" },
    data: { password: hashed },
  });

  // Clear force-change flag if set
  await db.user.update({
    where: { id: result.userId },
    data: { mustChangePassword: false },
  });

  return NextResponse.json({ ok: true });
}
