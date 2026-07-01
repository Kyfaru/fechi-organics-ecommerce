import { NextRequest } from "next/server";
import { connection } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { createResetToken } from "@/lib/password-reset";
import { TimeSpan } from "oslo";
import { assertTrustedOrigin } from "@/lib/origin-check";

// POST /api/admin/staff/send-reset — send a 45-min reset link to a staff member.
// Caller must have already verified their own password via /api/admin/verify-password.
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const caller = await db.user.findUnique({ where: { id: session.user.id } });
  if (caller?.role !== "admin") return Err.forbidden();

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return Err.validation("userId required");

  const target = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!target) return Err.notFound("Staff member");

  const token = await createResetToken(userId, new TimeSpan(45, "m"));
  const resetUrl = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/admin/reset-password?token=${token}`;

  const { sendAdminNotificationEmail } = await import("@/lib/email");
  await sendAdminNotificationEmail({
    to: target.email,
    subject: "Reset your Fechi Organics admin password",
    html: `<p>Hi ${target.name},</p><p>Your admin password has been reset by an administrator. Click the link below to set a new password. This link expires in 45 minutes.</p><p><a href="${resetUrl}" style="background:#1d5c16;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">Set New Password</a></p><p>If you did not expect this, contact your super admin immediately.</p>`,
  });

  return ok({ sent: true });
}
