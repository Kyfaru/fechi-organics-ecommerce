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
import { assertTrustedOrigin } from "@/lib/origin-check";

export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  if (!user) return Err.authRequired();
  if (user.role !== "admin") return Err.forbidden();

  // Strip sensitive fields before returning
  const { ...safeUser } = user;
  return ok({ user: safeUser });
}

export async function PATCH(req: Request) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return Err.authRequired();
  if (user.role !== "admin") return Err.forbidden();

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

    return ok({ user: updated });
  } catch (err) {
    console.error("[PATCH /api/admin/profile]", err);
    return Err.internal();
  }
}
