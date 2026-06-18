/**
 * GET /api/admin/activity
 *
 * Returns the 100 most recent audit log entries, joined with the admin user
 * name and email via adminProfile → user.
 *
 * Query params:
 *   ?staffId=<adminProfileId>  — filter by staff member
 *   ?resource=<string>         — filter by entity type
 *   ?from=<ISO date>           — start of date range
 *   ?to=<ISO date>             — end of date range
 */

import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const caller = await db.user.findUnique({ where: { id: session.user.id } });
  if (caller?.role !== "admin") return Err.forbidden();

  const { searchParams } = new URL(req.url);
  const staffId  = searchParams.get("staffId") ?? undefined;
  const resource = searchParams.get("resource") ?? undefined;
  const from     = searchParams.get("from") ?? undefined;
  const to       = searchParams.get("to") ?? undefined;

  const where: Prisma.auditLogWhereInput = {};

  if (staffId)  where.adminProfileId = staffId;
  if (resource) where.resource = { contains: resource, mode: "insensitive" };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }

  try {
    const logs = await db.auditLog.findMany({
      where,
      include: {
        adminProfile: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const shaped = logs.map((log) => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      details: log.details,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      adminProfileId: log.adminProfileId,
      staffName: log.adminProfile.user.name,
      staffEmail: log.adminProfile.user.email,
    }));

    return ok({ logs: shaped });
  } catch (err) {
    console.error("[GET /api/admin/activity]", err);
    return Err.internal();
  }
}
