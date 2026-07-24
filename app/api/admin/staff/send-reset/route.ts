import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { createResetToken } from "@/lib/password-reset";
import { TimeSpan } from "oslo";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";
import { emailShell, emailSection, emailButton, emailInfoBox, emailIconCircle, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";

// POST /api/admin/staff/send-reset — send a 45-min reset link to a staff member.
// Caller must have already verified their own password via /api/admin/verify-password
// (convention-only today — not enforced server-side here; a separate,
// already-scoped follow-up, not part of this RBAC pass).
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const denied = await requirePermission(req, { staff: ["update"] });
  if (denied) return denied;

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return Err.validation("userId required");

  const target = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!target) return Err.notFound("Staff member");

  const token = await createResetToken(userId, new TimeSpan(45, "m"));
  const resetUrl = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/admin/reset-password?token=${token}`;

  const sections = [
    emailSection(`
      ${emailIconCircle("lock")}
      <h1 style="margin:0 0 16px;text-align:center;font-family:${FONT_HEADING};font-size:26px;font-weight:700;color:${EMAIL_BRAND.textDark};">Admin Password Reset</h1>
      <p style="font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;margin:0 0 16px;">Hi ${target.name},</p>
      <p style="font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;margin:0 0 28px;">
        Your admin password has been reset by an administrator. Click below to set a new password. This link expires in <strong>45 minutes</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;"><tr><td>${emailButton("Set New Password", resetUrl)}</td></tr></table>
      ${emailInfoBox("If you did not expect this, contact your super admin immediately.", "warning")}
    `),
  ].join("");

  const { sendAdminNotificationEmail } = await import("@/lib/email");
  await sendAdminNotificationEmail({
    to: target.email,
    subject: "Reset your Fechi Organics admin password",
    html: emailShell({ title: "Admin Password Reset", sectionsHtml: sections }),
  });

  return ok({ sent: true });
}
