/**
 * GET  /api/admin/loyalty/grants  — list grant requests and the voting state
 * POST /api/admin/loyalty/grants  — raise a new grant request
 *
 * Gated on isSuperAdmin directly rather than on the permission matrix: the
 * `loyalty` resource is granted to admin, manager and marketing for read
 * access, and none of them may mint points.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { loadCallerContext } from "@/lib/require-permission";
import { createGrantRequest, activeSuperAdmins, GrantError } from "@/lib/points/grants";
import { reportError } from "@/lib/observability";

async function requireSuperAdmin() {
  const ctx = await loadCallerContext();
  if (ctx.denied) return { error: ctx.denied === "auth" ? Err.authRequired() : Err.forbidden() };
  if (!ctx.isSuperAdmin) return { error: Err.forbidden() };
  return { ctx };
}

export async function GET(req: NextRequest) {
  await connection();
  try {
    const guard = await requireSuperAdmin();
    if (guard.error) return guard.error;

    const [requests, voters] = await Promise.all([
      db.pointsGrantRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          requestedBy: { select: { id: true, fullName: true } },
          approvals: {
            select: {
              adminProfileId: true,
              decision: true,
              decidedAt: true,
              adminProfile: { select: { fullName: true } },
            },
          },
        },
      }),
      activeSuperAdmins(),
    ]);

    const targetIds = [...new Set(requests.map((r) => r.targetUserId))];
    const targets = await db.user.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true, email: true },
    });
    const targetById = new Map(targets.map((t) => [t.id, t]));

    return ok({
      requiredApprovals: voters.length,
      voters: voters.map((v) => ({
        id: v.id,
        fullName: v.fullName,
        remaining: v.pointsAllowance - v.pointsAllowanceSpent,
      })),
      myAdminProfileId: guard.ctx.id,
      requests: requests.map((r) => ({
        id: r.id,
        points: r.points,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        requestedBy: r.requestedBy,
        target: targetById.get(r.targetUserId) ?? { id: r.targetUserId, name: null, email: null },
        approvals: r.approvals.map((a) => ({
          adminProfileId: a.adminProfileId,
          fullName: a.adminProfile?.fullName ?? null,
          decision: a.decision,
          decidedAt: a.decidedAt,
        })),
        outstanding: voters
          .filter((v) => !r.approvals.some((a) => a.adminProfileId === v.id && a.decision === "APPROVED"))
          .map((v) => v.fullName),
        iHaveVoted: r.approvals.some((a) => a.adminProfileId === guard.ctx.id),
      })),
    });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/loyalty/grants", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}

const postSchema = z
  .object({
    targetUserId: z.string().min(1),
    points: z.number().int().positive(),
    note: z.string().min(3).max(500),
  })
  .strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const guard = await requireSuperAdmin();
    if (guard.error) return guard.error;

    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Err.validation("targetUserId, points and a reason are required");

    const outcome = await createGrantRequest({
      requesterAdminProfileId: guard.ctx.id,
      ...parsed.data,
    });
    return created(outcome);
  } catch (e) {
    if (e instanceof GrantError) return Err.validation(e.message);
    reportError(e, { route: "POST /api/admin/loyalty/grants", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
