import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { roles, type RoleName } from "@/lib/permissions";
import { assertTrustedOrigin } from "@/lib/origin-check";

interface Params { params: Promise<{ id: string }> }

async function getCallerAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  if (user?.role !== "admin") return null;
  return { user, session };
}

// PATCH — ban/unban (staff:update) OR change role (staff:assign_roles)
export async function PATCH(req: NextRequest, { params }: Params) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Err.validation("Invalid JSON body."); }

  const isBanChange = typeof body.banned === "boolean" || typeof body.banReason === "string";
  const isRoleChange = typeof body.role === "string" && body.role in roles;

  if (!isBanChange && !isRoleChange) {
    return Err.validation("No valid fields to update.");
  }
  if (isBanChange) {
    const denied = await requirePermission(req, { staff: ["update"] });
    if (denied) return denied;
  }
  if (isRoleChange) {
    const denied = await requirePermission(req, { staff: ["assign_roles"] });
    if (denied) return denied;
  }

  const caller = await getCallerAdmin(req);
  if (!caller) return Err.forbidden();
  if (id === caller.session.user.id) return Err.validation("You cannot modify your own account here.");

  const userUpdate: Record<string, unknown> = {};
  const profileUpdate: Record<string, unknown> = {};

  // Ban/unban
  if (typeof body.banned === "boolean") {
    userUpdate.banned = body.banned;
    if (!body.banned) userUpdate.banReason = null;
  }
  if (typeof body.banReason === "string") {
    userUpdate.banReason = body.banReason || null;
  }

  // Role change — promoting a target to super_admin requires the caller to
  // already be a super_admin, not just hold staff:assign_roles.
  if (isRoleChange) {
    const role = body.role as RoleName;
    if (role === "super_admin" && !caller.user.adminProfile?.isSuperAdmin) {
      return Err.forbidden();
    }
    profileUpdate.role = role;
    if (role === "super_admin" || role === "admin") profileUpdate.isSuperAdmin = role === "super_admin";
  }

  try {
    const updated = await db.user.update({
      where: { id },
      data: {
        ...userUpdate,
        ...(Object.keys(profileUpdate).length > 0
          ? { adminProfile: { update: profileUpdate } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        banReason: true,
        createdAt: true,
        updatedAt: true,
        adminProfile: {
          select: { id: true, fullName: true, department: true, permissions: true, isSuperAdmin: true, isActive: true },
        },
      },
    });
    return ok({ user: updated });
  } catch (err) {
    console.error("[PATCH /api/admin/staff/[id]]", err);
    return Err.internal(err);
  }
}

// DELETE — hard-delete a deactivated staff member (super-admin only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const denied = await requirePermission(req, { staff: ["delete"] });
  if (denied) return denied;

  const caller = await getCallerAdmin(req);
  if (!caller) return Err.forbidden();
  if (!caller.user.adminProfile?.isSuperAdmin) {
    return Err.forbidden();
  }

  const { id } = await params;
  if (id === caller.session.user.id) return Err.validation("Cannot delete your own account.");

  const target = await db.user.findUnique({
    where: { id },
    select: { banned: true, adminProfile: { select: { isActive: true } } },
  });
  if (!target) return Err.notFound("Staff member not found.");
  if (!target.banned && target.adminProfile?.isActive !== false) {
    return Err.validation("Deactivate the user before deleting.");
  }

  await db.user.delete({ where: { id } }); // cascades to adminProfile, session, account
  return ok({ deleted: id });
}
