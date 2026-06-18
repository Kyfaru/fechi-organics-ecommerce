/**
 * POST /api/admin/staff/invite
 *
 * Body: { name: string; email: string; role: string; note?: string }
 *
 * Currently logs the invite and returns success.
 * TODO: integrate Resend to send an actual invitation email with a
 *       time-limited signed token that lets the invitee set up their account.
 */

import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

const VALID_ROLES = ["Admin", "Manager", "Inventory", "Support", "Viewer"] as const;

export async function POST(req: Request) {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  // Only admins can invite staff
  const { db } = await import("@/lib/db");
  const caller = await db.user.findUnique({ where: { id: session.user.id } });
  if (caller?.role !== "admin") return Err.forbidden();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }

  const { name, email, role, note } = body as {
    name?: string;
    email?: string;
    role?: string;
    note?: string;
  };

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return Err.validation("Name must be at least 2 characters.");
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Err.validation("A valid email address is required.");
  }
  if (!role || !VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return Err.validation(`Role must be one of: ${VALID_ROLES.join(", ")}.`);
  }

  // TODO: Generate a signed invite token (e.g., JWT or UUID stored in DB)
  // TODO: Send invitation email via Resend with the invite link
  console.info("[staff/invite] Invitation logged:", {
    invitedBy: session.user.email,
    name: name.trim(),
    email: email.toLowerCase(),
    role,
    note: note ?? "(none)",
  });

  return ok({
    message: "Invitation sent.",
    // TODO: return token/expiry once real email flow is implemented
  });
}
