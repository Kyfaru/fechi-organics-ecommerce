/**
 * POST /api/admin/staff/invite
 *
 * Creates a new admin user account and adminProfile from the invite form.
 * Optionally sends an email invite via Resend and/or an SMS via Twilio.
 *
 * Body: {
 *   name, username?, email, phone?, password,
 *   role, permissions, branchId?, accessExpiresAt?,
 *   inviteChannels: string[],
 *   note?
 * }
 */

import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { appResources, grantsFor, type RoleName } from "@/lib/permissions";

const VALID_ROLES = [
  "admin", "manager", "finance", "marketing",
  "inventory", "customer_care", "viewer",
] as const;

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { staff: ["invite"] });
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const { db } = await import("@/lib/db");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }

  const {
    name,
    username,
    email,
    phone,
    password,
    role,
    permissions,
    branchId,
    accessExpiresAt,
    inviteChannels,
    note,
  } = body as {
    name?: string;
    username?: string;
    email?: string;
    phone?: string;
    password?: string;
    role?: string;
    permissions?: { deny?: string[] };
    branchId?: string;
    accessExpiresAt?: string | null;
    inviteChannels?: string[];
    note?: string;
  };

  // Validate required fields
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return Err.validation("Name must be at least 2 characters.");
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Err.validation("A valid email address is required.");
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return Err.validation("Password must be at least 8 characters.");
  }
  if (!role || !VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return Err.validation(`Role must be one of: ${VALID_ROLES.join(", ")}.`);
  }
  if (username && !/^\w{3,}$/.test(username)) {
    return Err.validation("Username must be alphanumeric/underscore and at least 3 characters.");
  }

  // Narrowing override — only resources the picked role actually grants can
  // be denied; this can never widen access, only restrict it further.
  const requestedDeny = new Set(permissions?.deny ?? []);
  const sanitizedDeny = appResources.filter(
    (resource) => requestedDeny.has(resource) && grantsFor(role as RoleName, resource).length > 0
  );

  // Check for duplicate email or username
  const existing = await db.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, ...(username ? [{ username }] : [])] },
    select: { id: true, email: true, username: true },
  });
  if (existing?.email === email.toLowerCase()) {
    return Err.validation("An account with this email already exists.");
  }
  if (existing?.username && username && existing.username === username) {
    return Err.validation("This username is already taken.");
  }

  try {
    // Create user account via Better Auth so password hashing is handled correctly
    const createResult = await auth.api.createUser({
      body: {
        name: name.trim(),
        email: email.toLowerCase(),
        password,
        role: "admin",
      },
    });

    if (!createResult?.user?.id) {
      console.error("[staff/invite] createUser returned no user id", createResult);
      return Err.internal("Failed to create user account.");
    }

    const userId = createResult.user.id;

    // Force a password change on first login and set the username if provided.
    await db.user.update({
      where: { id: userId },
      data: { mustChangePassword: true, ...(username ? { username } : {}) },
    });

    // Upsert adminProfile with all staff fields. Access control is
    // determined by `role` (looked up against lib/permissions.ts's
    // code-defined roles) narrowed by `permissions.deny` — see
    // lib/require-permission.ts's loadCallerContext.
    await db.adminProfile.upsert({
      where: { userId },
      create: {
        userId,
        fullName:        name.trim(),
        role:            role,
        permissions:     sanitizedDeny.length > 0 ? { deny: sanitizedDeny } : {},
        branchId:        branchId || null,
        accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
        isActive:        true,
        isSuperAdmin:    false,
      },
      update: {
        fullName:        name.trim(),
        role:            role,
        permissions:     sanitizedDeny.length > 0 ? { deny: sanitizedDeny } : {},
        branchId:        branchId || null,
        accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
      },
    });

    const channels = Array.isArray(inviteChannels) ? inviteChannels : [];

    // Send email invite if requested
    if (channels.includes("email")) {
      try {
        const { sendAdminNotificationEmail } = await import("@/lib/email");
        await sendAdminNotificationEmail({
          to: email.toLowerCase(),
          subject: "You've been invited to the Fechi Organics admin panel",
          html: buildInviteEmailHTML({ name: name.trim(), email: email.toLowerCase(), role, note, password }),
        });
      } catch (emailErr) {
        // Email failure is non-fatal — account was created; log and continue
        console.error("[staff/invite] Email send failed:", emailErr);
      }
    }

    // Send SMS invite if requested and phone is provided
    if (channels.includes("sms") && phone) {
      try {
        const { sendSms } = await import("@/lib/sms");
        await sendSms(
          phone,
          `Hi ${name.trim()}, you've been invited to the Fechi Organics admin panel. Log in at ${process.env.NEXT_PUBLIC_APP_URL}/admin/login`
        );
      } catch (smsErr) {
        // SMS failure is non-fatal — account was created; log and continue
        console.error("[staff/invite] SMS send failed:", smsErr);
      }
    }

    // Non-fatal notification
    const { createNotification } = await import("@/lib/notify");
    createNotification({
      type: role === "admin" ? "ADMIN_ADDED" : "STAFF_ADDED",
      title: role === "admin" ? "New admin added" : "New staff added",
      body: `${name.trim()} (${role}) joined the team`,
      link: "/admin/staff",
      branchId: role === "admin" ? null : (branchId as string | undefined) ?? null,
    }).catch(() => {});

    console.info("[staff/invite] Staff created:", {
      invitedBy: session.user.email,
      userId,
      email: email.toLowerCase(),
      role,
      channels,
    });

    return ok({ message: "Staff member invited successfully.", userId });
  } catch (err) {
    console.error("[staff/invite] POST error:", err);
    return Err.internal(err);
  }
}

// ---------------------------------------------------------------------------
// Email template
// ---------------------------------------------------------------------------
function buildInviteEmailHTML(args: {
  name: string;
  email: string;
  role: string;
  note?: string;
  password?: string;
}): string {
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://fechiorganics.com"}/admin/login`;
  const roleDisplay = args.role.charAt(0).toUpperCase() + args.role.slice(1).replace("_", " ");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Admin Invitation</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:#27731e;padding:40px 48px 36px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Fechi Organics</p>
            <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#ffffff;">You're Invited</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            <p style="font-size:15px;color:#40493c;line-height:1.6;margin:0 0 16px;">Hi <strong>${args.name}</strong>,</p>
            <p style="font-size:15px;color:#40493c;line-height:1.6;margin:0 0 16px;">
              You have been invited to join the Fechi Organics admin panel as <strong>${roleDisplay}</strong>.
            </p>
            ${args.note ? `<p style="font-size:14px;color:#40493c;line-height:1.6;background:#f4f6f3;border-radius:8px;padding:16px;margin:0 0 24px;">${args.note}</p>` : ""}
            <p style="font-size:14px;color:#666;margin:0 0 8px;">Your login email: <strong>${args.email}</strong></p>
            ${args.password ? `<p style="font-size:14px;color:#666;margin:0 0 8px;">Your temporary password:</p>
            <div style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;letter-spacing:1px;color:#1a1c1c;background:#f4f6f3;border:1px dashed #27731e;border-radius:8px;padding:14px 20px;margin:0 0 8px;text-align:center;">${args.password}</div>
            <p style="font-size:13px;color:#999;margin:0 0 8px;">You'll be asked to change this password when you first sign in.</p>` : ""}
            <a href="${loginUrl}" style="display:inline-block;margin-top:24px;background:#27731e;color:#ffffff;padding:14px 32px;border-radius:40px;font-size:15px;font-weight:700;text-decoration:none;">
              Sign in to Admin Panel
            </a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
