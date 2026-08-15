/**
 * GET   /api/admin/profile — return current admin's user + adminProfile
 * PATCH /api/admin/profile — update name, phone, adminProfile fields (fullName, department)
 *
 * adminProfile schema: id, userId, fullName, permissions (Json), department?, isActive, createdAt, updatedAt
 * Note: adminProfile does NOT have displayName/jobTitle/bio/avatarKey — use fullName and department
 */

import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireStaffSession } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";
import { logActivity } from "@/lib/admin-activity";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requireStaffSession(req);
  if (denied) return denied;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Err.authRequired();

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      include: { adminProfile: true },
    });
    if (!user) return Err.authRequired();

    // Strip sensitive fields before returning
    const { ...safeUser } = user;
    return ok({ user: safeUser });
  } catch (err) {
    reportError(err, { route: "GET /api/admin/profile", tags: { domain: "profile" } });
    console.error("[GET /api/admin/profile]", err);
    return Err.internal();
  }
}

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requireStaffSession(req);
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return Err.authRequired();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }

  const { name, phone, fullName, department, image } = body as {
    name?: string;
    phone?: string;
    fullName?: string;
    department?: string;
    image?: string;
  };

  try {
    // Update user-level fields
    const userUpdate: Record<string, unknown> = {};
    if (name && typeof name === "string") userUpdate.name = name.trim();
    if (typeof phone === "string") userUpdate.phone = phone.trim() || null;
    if (typeof image === "string") userUpdate.image = image.trim() || null;

    if (Object.keys(userUpdate).length > 0) {
      await db.user.update({ where: { id: user.id }, data: userUpdate });
    }

    // Update or create adminProfile fields
    const profileUpdate: Record<string, unknown> = {};
    if (fullName && typeof fullName === "string") profileUpdate.fullName = fullName.trim();
    if (typeof department === "string") profileUpdate.department = department.trim() || null;

    if (Object.keys(profileUpdate).length > 0) {
      await db.adminProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          fullName: (fullName as string | undefined)?.trim() ?? user.name,
          ...profileUpdate,
        },
        update: profileUpdate,
      });
    }

    const updated = await db.user.findUnique({
      where: { id: user.id },
      include: { adminProfile: true },
    });

    // Diff before/after for name/phone (mirrors the changedFields pattern in
    // app/api/admin/customers/[id]/route.ts) — fullName/department changes
    // aren't logged here since they're lower-stakes profile metadata.
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    if (userUpdate.name !== undefined && userUpdate.name !== user.name) changed.name = { from: user.name, to: userUpdate.name };
    if (userUpdate.phone !== undefined && userUpdate.phone !== user.phone) changed.phone = { from: user.phone, to: userUpdate.phone };
    if (Object.keys(changed).length && updated?.adminProfile) {
      logActivity(updated.adminProfile.id, `Updated own profile (${Object.keys(changed).join(", ")})`, "profile", updated.adminProfile.id, req, changed, "INFO");
    }

    return ok({ user: updated });
  } catch (err) {
    reportError(err, { route: "PATCH /api/admin/profile", userId: user.id, tags: { domain: "profile" } });
    console.error("[PATCH /api/admin/profile]", err);
    return Err.internal();
  }
}
