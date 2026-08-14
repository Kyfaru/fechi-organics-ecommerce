import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { roles, appResources, grantsFor, type RoleName } from "@/lib/permissions";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { logActivity } from "@/lib/admin-activity";
import { reportError } from "@/lib/observability";

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
  try {
    body = await req.json();
  } catch (parseErr) {
    reportError(parseErr, { route: "PATCH /api/admin/staff/[id]" });
    return Err.validation("Invalid JSON body.");
  }

  const isBanChange = typeof body.banned === "boolean" || typeof body.banReason === "string";
  const isRoleChange = typeof body.role === "string" && body.role in roles;
  const isPermissionChange =
    !isRoleChange &&
    typeof body.permissions === "object" &&
    body.permissions !== null &&
    Array.isArray((body.permissions as { deny?: unknown }).deny);
  const isDetailsChange =
    typeof body.name === "string" || typeof body.email === "string" || typeof body.phone === "string";
  const isSuperAdminGrant = typeof body.isSuperAdmin === "boolean";

  if (!isBanChange && !isRoleChange && !isPermissionChange && !isDetailsChange && !isSuperAdminGrant) {
    return Err.validation("No valid fields to update.");
  }
  if (isBanChange || isDetailsChange) {
    const denied = await requirePermission(req, { staff: ["update"] });
    if (denied) return denied;
  }
  if (isRoleChange || isPermissionChange || isSuperAdminGrant) {
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
    if (!body.banned) {
      userUpdate.banReason = null;
      // Unbanning re-admits a previously-locked-out account — force a fresh
      // password before they can reach the admin area again.
      userUpdate.mustChangePassword = true;
    }
  }
  if (typeof body.banReason === "string") {
    userUpdate.banReason = body.banReason || null;
  }

  // Basic details — name / email / phone
  if (typeof body.name === "string") {
    if (!body.name.trim()) return Err.validation("Name cannot be empty.");
    userUpdate.name = body.name.trim();
  }
  if (typeof body.email === "string") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return Err.validation("Enter a valid email address.");
    userUpdate.email = body.email.trim().toLowerCase();
  }
  if (typeof body.phone === "string") {
    userUpdate.phone = body.phone.trim() || null;
  }

  // Role change — promoting a target to super_admin requires the caller to
  // already be a super_admin, not just hold staff:assign_roles.
  if (isRoleChange) {
    const role = body.role as RoleName;
    if (role === "super_admin" && !caller.user.adminProfile?.isSuperAdmin) {
      return Err.forbidden();
    }
    profileUpdate.role = role;
    // A stale deny-list surviving a role swap could over-restrict the new
    // role or reference resources meaningless to it — reset it; the caller
    // can re-narrow via Edit Permissions afterward if needed.
    profileUpdate.permissions = {};
  } else if (isPermissionChange) {
    const target = await db.user.findUnique({
      where: { id },
      select: { adminProfile: { select: { role: true } } },
    });
    const targetRole = (target?.adminProfile?.role ?? "viewer") as RoleName;
    const requestedDeny = new Set((body.permissions as { deny: string[] }).deny);
    const sanitizedDeny = appResources.filter(
      (resource) => requestedDeny.has(resource) && grantsFor(targetRole, resource).length > 0
    );
    profileUpdate.permissions = sanitizedDeny.length > 0 ? { deny: sanitizedDeny } : {};
  }

  // Super Admin grant/revoke — a separate consent from role selection now
  // that the UI no longer offers "super_admin" as a role option; granting
  // it still requires the caller to already be a super admin.
  if (isSuperAdminGrant) {
    if (body.isSuperAdmin === true && !caller.user.adminProfile?.isSuperAdmin) {
      return Err.forbidden();
    }
    profileUpdate.isSuperAdmin = body.isSuperAdmin;
  }

  try {
    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    if (isRoleChange || isPermissionChange || isSuperAdminGrant) {
      const outcome = await requireApprovalOrProceed(ctx, "staff", "assign_roles", { role: body.role, permissions: body.permissions, isSuperAdmin: body.isSuperAdmin }, id);
      if (!outcome.proceed) return Approval.queued(outcome.requestId);
    }

    let updated;
    if (isRoleChange || isPermissionChange || isSuperAdminGrant) {
      // Same profileUpdate this route already built — reuse the shared
      // executor so the approval-decide path performs the identical mutation.
      await approvalExecutors["staff:assign_roles"]({ role: profileUpdate.role, permissions: profileUpdate.permissions, isSuperAdmin: profileUpdate.isSuperAdmin }, id);
      updated = await db.user.update({
        where: { id },
        data: userUpdate,
        select: {
          id: true, name: true, email: true, phone: true, role: true, banned: true, banReason: true,
          createdAt: true, updatedAt: true,
          adminProfile: { select: { id: true, fullName: true, department: true, permissions: true, isSuperAdmin: true, isActive: true } },
        },
      });
    } else {
      updated = await db.user.update({
        where: { id },
        data: {
          ...userUpdate,
          ...(Object.keys(profileUpdate).length > 0 ? { adminProfile: { update: profileUpdate } } : {}),
        },
        select: {
          id: true, name: true, email: true, phone: true, role: true, banned: true, banReason: true,
          createdAt: true, updatedAt: true,
          adminProfile: { select: { id: true, fullName: true, department: true, permissions: true, isSuperAdmin: true, isActive: true } },
        },
      });
    }

    if (isBanChange) {
      await logActivity(ctx.id, typeof body.banned === "boolean" ? (body.banned ? "Deactivated staff member" : "Reactivated staff member") : "Updated ban reason", "staff", id, req, undefined, "WARNING");
    }
    if (isDetailsChange) await logActivity(ctx.id, "Updated staff details", "staff", id, req);
    if (isRoleChange || isPermissionChange || isSuperAdminGrant) await logActivity(ctx.id, "Changed staff role/permissions", "staff", id, req, { role: body.role, permissions: body.permissions, isSuperAdmin: body.isSuperAdmin }, "CRITICAL");

    return ok({ user: updated });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2002") {
      return Err.validation("A staff member with this email already exists.");
    }
    console.error("[PATCH /api/admin/staff/[id]]", err);
    reportError(err, { route: "PATCH /api/admin/staff/[id]" });
    return Err.internal();
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

  let reason: string;
  try {
    const body = await req.json();
    reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  } catch {
    reason = "";
  }
  if (!reason) return Err.validation("A reason is required to delete a staff member");

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

  const ctx = await loadCallerContext();
  if (ctx.denied) return Err.forbidden();

  // Effectively always "proceed" today — staff:delete is hard-restricted to
  // isSuperAdmin above, and super_admin always skips the queue — but wired
  // in case staff:delete permission is ever extended to another role.
  const outcome = await requireApprovalOrProceed(ctx, "staff", "delete", { reason }, id);
  if (!outcome.proceed) return Approval.queued(outcome.requestId);

  try {
    await approvalExecutors["staff:delete"]({}, id); // cascades to adminProfile, session, account
  } catch (e: unknown) {
    // P2003: still-referenced by a Restrict relation we haven't nulled out
    // (e.g. authored blog posts) — name it instead of a bare 500.
    if ((e as { code?: string }).code === "P2003") {
      return Err.validation(
        "This staff member is still referenced elsewhere (e.g. authored content) and can't be deleted yet."
      );
    }
    console.error("[DELETE /api/admin/staff/[id]]", e);
    reportError(e, { route: "DELETE /api/admin/staff/[id]" });
    return Err.internal();
  }
  await logActivity(ctx.id, "Deleted staff member", "staff", id, req, { reason }, "CRITICAL");
  return ok({ deleted: id });
}
