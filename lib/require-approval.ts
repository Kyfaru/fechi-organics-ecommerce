/**
 * Gate for sensitive actions that non-admin roles may only *request*, not
 * perform directly. admin/super_admin proceed immediately — no behavior
 * change for them. Every other role gets the action queued as a PENDING
 * approvalRequest instead of executed, and every admin/super_admin is
 * notified (see lib/notify.ts — branchId: null scopes the notification to
 * the global/admin tier by existing convention).
 *
 * Usage in a route handler, after loadCallerContext():
 *   const outcome = await requireApprovalOrProceed(ctx, "products", "delete", { id }, id);
 *   if (!outcome.proceed) return Approval.queued(outcome.requestId);
 *   // ...perform the action...
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import type { CallerContext } from "@/lib/require-permission";

export type ApprovalOutcome =
  | { proceed: true }
  | { proceed: false; requestId: string };

type ActiveCallerContext = Extract<CallerContext, { denied?: undefined }>;

export async function requireApprovalOrProceed(
  ctx: ActiveCallerContext,
  resource: string,
  action: string,
  payload: Record<string, unknown>,
  resourceId?: string,
): Promise<ApprovalOutcome> {
  if (ctx.role === "admin" || ctx.role === "super_admin") return { proceed: true };

  const request = await db.approvalRequest.create({
    data: {
      requestedByAdminProfileId: ctx.id,
      resource,
      action,
      resourceId: resourceId ?? null,
      payload: payload as Prisma.InputJsonValue,
    },
  });

  createNotification({
    type: "APPROVAL_REQUESTED",
    title: "Approval requested",
    body: `A staff member requested to ${action} on ${resource}${resourceId ? ` (${resourceId})` : ""}.`,
    link: "/admin/approvals",
    branchId: null,
  }).catch(() => {});

  return { proceed: false, requestId: request.id };
}

export const Approval = {
  /** 202 Accepted — the action was queued for admin review, not performed. */
  queued: (requestId: string) =>
    Response.json({ ok: true, data: { queued: true, requestId } }, { status: 202 }),
};
