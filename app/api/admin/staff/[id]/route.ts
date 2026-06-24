/**
 * PATCH /api/admin/staff/[id] — update role or banned status for a staff member
 *
 * Body: { banned?: boolean; banReason?: string }
 * Guards: admin only; cannot demote/ban yourself
 */

import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requireAdminPage } from "@/lib/admin-guard";

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  await connection();

  const denied = await requireAdminPage(req, 'staff');
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const caller = await db.user.findUnique({ where: { id: session.user.id } });
  if (caller?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  if (id === session.user.id) {
    return Err.validation("You cannot modify your own account here.");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }

  const updateData: Record<string, unknown> = {};

  if (typeof body.banned === "boolean") {
    updateData.banned = body.banned;
    if (!body.banned) updateData.banReason = null;
  }
  if (typeof body.banReason === "string") {
    updateData.banReason = body.banReason || null;
  }

  if (Object.keys(updateData).length === 0) {
    return Err.validation("No valid fields to update.");
  }

  try {
    const updated = await db.user.update({
      where: { id },
      data: updateData,
      include: { adminProfile: true },
    });

    return ok({ user: updated });
  } catch (err) {
    console.error("[PATCH /api/admin/staff/[id]]", err);
    return Err.internal();
  }
}
