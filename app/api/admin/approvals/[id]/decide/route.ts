/**
 * POST /api/admin/approvals/[id]/decide — approve or reject a pending
 * approval request. Approving re-runs the original action via
 * lib/approval-executors.ts; rejecting just records the decision.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { approvalExecutors } from "@/lib/approval-executors";
import { createNotification } from "@/lib/notify";
import { logActivity } from "@/lib/admin-activity";

const BodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { approvals: ["decide"] });
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
    const { decision, note } = parsed.data;

    const request = await db.approvalRequest.findUnique({
      where: { id },
      include: { requestedBy: { select: { branchId: true, role: true } } },
    });
    if (!request) return Err.notFound("Approval request");
    if (request.status !== "PENDING") return Err.validation("This request was already decided.");

    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    if (decision === "approve") {
      const executor = approvalExecutors[`${request.resource}:${request.action}`];
      if (!executor) {
        return Err.validation(`No executor registered for ${request.resource}:${request.action}.`);
      }
      await executor(request.payload as Record<string, unknown>, request.resourceId);
    }

    await db.approvalRequest.update({
      where: { id },
      data: {
        status: decision === "approve" ? "APPROVED" : "REJECTED",
        reviewedByAdminProfileId: ctx.id,
        reviewNote: note ?? null,
        reviewedAt: new Date(),
      },
    });

    // Best-effort — no true per-user targeting exists, so this is scoped as
    // tightly as the notification system allows: the requester's own branch
    // + role (see lib/notifications/scope.ts's buildNotificationWhere —
    // branchId: null would only reach global-tier admins, never the
    // requester, who is by definition not one).
    createNotification({
      type: "APPROVAL_DECIDED",
      title: decision === "approve" ? "Request approved" : "Request rejected",
      body: `${request.resource}:${request.action} was ${decision === "approve" ? "approved" : "rejected"}.`,
      link: "/admin/approvals",
      branchId: request.requestedBy.branchId,
      targetRoles: [request.requestedBy.role],
    }).catch(() => {});

    logActivity(ctx.id, `${decision === "approve" ? "Approved" : "Rejected"} ${request.resource}:${request.action}`, "approval", id, req);

    return ok({ decided: true });
  } catch (e) {
    console.error("[admin/approvals/[id]/decide] POST error", e);
    return Err.internal(e);
  }
}
