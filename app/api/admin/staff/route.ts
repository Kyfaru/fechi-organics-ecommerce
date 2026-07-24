/**
 * GET  /api/admin/staff  — return all admin users with their adminProfile
 * POST is not used here; invite is handled by /api/admin/staff/invite
 */

import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { staff: ["view"] });
  if (denied) return denied;

  try {
    const staff = await db.user.findMany({
      where: { role: "admin" },
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
          // `role` (the app-level role template, distinct from user.role) is
          // read by AdminStaffClient's RolePill/change-role modal and by
          // AuthorPicker — it was missing from this select, so those screens
          // were silently rendering `undefined`.
          select: { id: true, fullName: true, department: true, permissions: true, isSuperAdmin: true, isActive: true, role: true },
        },
        sessions: {
          where: { expiresAt: { gt: new Date() } },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Shape the response — omit raw session tokens
    const shaped = staff.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      banned: u.banned,
      banReason: u.banReason,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      adminProfile: u.adminProfile,
      // Last active = the most recent session updatedAt, or null
      lastActiveAt: u.sessions[0]?.updatedAt ?? null,
    }));

    return ok({ staff: shaped });
  } catch (err) {
    console.error("[GET /api/admin/staff]", err);
    return Err.internal(err);
  }
}
