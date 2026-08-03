/**
 * GET /api/admin/approvals — list pending approval requests (admin/super_admin only).
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { approvals: ["view"] });
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "PENDING";

    const requests = await db.approvalRequest.findMany({
      where: { status: status as "PENDING" | "APPROVED" | "REJECTED" },
      include: {
        requestedBy: { select: { fullName: true, user: { select: { name: true, email: true } } } },
        reviewedBy: { select: { fullName: true, user: { select: { name: true, email: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const shaped = requests.map((r) => ({
      id: r.id,
      resource: r.resource,
      action: r.action,
      resourceId: r.resourceId,
      payload: r.payload,
      status: r.status,
      requestedByName: r.requestedBy.fullName ?? r.requestedBy.user.name,
      requestedByEmail: r.requestedBy.user.email,
      reviewedByName: r.reviewedBy?.fullName ?? r.reviewedBy?.user.name ?? null,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    }));

    return ok({ requests: shaped });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/approvals", tags: { domain: "approvals" } });
    console.error("[admin/approvals] GET error", e);
    return Err.internal();
  }
}
