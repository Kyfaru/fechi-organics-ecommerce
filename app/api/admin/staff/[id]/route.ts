import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requireAdminPage } from "@/lib/admin-guard";
import { permissionsFromRole, ROLE_TEMPLATES, type AdminPage } from "@/lib/permissions";

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

// PATCH — ban/unban OR change role/permissions
export async function PATCH(req: NextRequest, { params }: Params) {
  await connection();
  const denied = await requireAdminPage(req, "staff");
  if (denied) return denied;

  const caller = await getCallerAdmin(req);
  if (!caller) return Err.forbidden();

  const { id } = await params;
  if (id === caller.session.user.id) return Err.validation("You cannot modify your own account here.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Err.validation("Invalid JSON body."); }

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

  // Role / permissions change — caller must be super-admin or pass verify-password separately
  if (typeof body.role === "string" && body.role in ROLE_TEMPLATES) {
    const role = body.role as string;
    profileUpdate.role = role;
    // If custom pages provided, use them; otherwise use template
    const pages: AdminPage[] = Array.isArray(body.pages)
      ? (body.pages as AdminPage[])
      : permissionsFromRole(role).pages;
    profileUpdate.permissions = { pages };
    if (role === "super_admin" || role === "admin") profileUpdate.isSuperAdmin = role === "super_admin";
  }

  if (Object.keys(userUpdate).length === 0 && Object.keys(profileUpdate).length === 0) {
    return Err.validation("No valid fields to update.");
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
      include: { adminProfile: true },
    });
    return ok({ user: updated });
  } catch (err) {
    console.error("[PATCH /api/admin/staff/[id]]", err);
    return Err.internal();
  }
}

// DELETE — hard-delete a deactivated staff member (super-admin only)
export async function DELETE(req: NextRequest, { params }: Params) {
  await connection();
  const denied = await requireAdminPage(req, "staff");
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
