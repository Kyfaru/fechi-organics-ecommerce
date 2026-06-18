/**
 * GET  /api/admin/staff  — return all admin users with their adminProfile
 * POST is not used here; invite is handled by /api/admin/staff/invite
 */

import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const caller = await db.user.findUnique({ where: { id: session.user.id } });
  if (caller?.role !== "admin") return Err.forbidden();

  try {
    const staff = await db.user.findMany({
      where: { role: "admin" },
      include: {
        adminProfile: true,
        sessions: {
          where: { expiresAt: { gt: new Date() } },
          orderBy: { updatedAt: "desc" },
          take: 1,
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
    return Err.internal();
  }
}
