import { NextRequest } from "next/server";
import { connection } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { Argon2id } from "oslo/password";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { logActivity } from "@/lib/admin-activity";
import { reportError } from "@/lib/observability";

// POST /api/admin/staff/set-password — directly set a new password for a staff member.
// Caller must have already verified their own password via /api/admin/verify-password
// (convention-only today — not enforced server-side here; a separate,
// already-scoped follow-up, not part of this RBAC pass).
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const denied = await requirePermission(req, { staff: ["update"] });
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const { userId, newPassword } = await req.json().catch((parseErr) => {
    reportError(parseErr, { route: "POST /api/admin/staff/set-password" });
    return {};
  });
  if (!userId || !newPassword || newPassword.length < 8) return Err.validation("userId and newPassword (min 8 chars) required");
  if (userId === session.user.id) return Err.validation("Use the profile page to change your own password");

  const hashed = await new Argon2id().hash(newPassword);

  await db.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: hashed },
  });

  // Force the user to change on next login
  await db.user.update({ where: { id: userId }, data: { mustChangePassword: true } });

  const ctx = await loadCallerContext();
  if (!ctx.denied) logActivity(ctx.id, "Set a new password for staff member", "staff", userId, req);

  return ok({ updated: true });
}
