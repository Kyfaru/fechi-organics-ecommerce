/**
 * PATCH /api/admin/profile/password
 *
 * Body: { currentPassword: string; newPassword: string }
 *
 * Uses Better Auth's changePassword action — requires the user to be signed in.
 * Better Auth handles current-password verification and hashing internally.
 */

import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireStaffSession } from "@/lib/require-permission";

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requireStaffSession(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }

  const { currentPassword, newPassword } = body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || typeof currentPassword !== "string") {
    return Err.validation("Current password is required.");
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    return Err.validation("New password must be at least 8 characters.");
  }
  if (currentPassword === newPassword) {
    return Err.validation("New password must differ from the current password.");
  }

  try {
    // Delegate to Better Auth's built-in changePassword — it verifies the current
    // password and hashes the new one. We pass the current headers so Better Auth
    // can identify the session.
    const hdrs = await headers();
    const result = await auth.api.changePassword({
      headers: hdrs,
      body: { currentPassword, newPassword, revokeOtherSessions: false },
    });

    if (!result) {
      return Err.validation("Current password is incorrect.");
    }

    return ok({ message: "Password updated successfully." });
  } catch (err) {
    console.error("[PATCH /api/admin/profile/password]", err);
    // Better Auth throws on incorrect current password
    const msg = err instanceof Error ? err.message : "Password change failed.";
    if (msg.toLowerCase().includes("password")) {
      return Err.validation("Current password is incorrect.");
    }
    return Err.internal(err);
  }
}
