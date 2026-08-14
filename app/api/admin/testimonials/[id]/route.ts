import { db } from "@/lib/db";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// DELETE /api/admin/testimonials/[id]
// Permanently deletes a testimonial by id. Non-admin roles get the delete
// queued for approval instead (see requireApprovalOrProceed).
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { content: ["delete"] });
    if (denied) return denied;

    const { id } = await params;

    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const outcome = await requireApprovalOrProceed(ctx, "content", "delete", { kind: "testimonial" }, id);
    if (!outcome.proceed) return Approval.queued(outcome.requestId);

    await approvalExecutors["content:delete"]({ kind: "testimonial" }, id);

    console.info("[admin/testimonials] deleted", id);
    return ok({ deleted: true });
  } catch (e) {
    // Prisma throws P2025 when the record does not exist
    if ((e as { code?: string }).code === "P2025") return Err.notFound("Testimonial");
    console.error("[admin/testimonials] DELETE error", e);
    reportError(e, { route: "DELETE /api/admin/testimonials/[id]" });
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/testimonials/[id]
// Partial update - accepts any combination of { approved, sortOrder }.
// ---------------------------------------------------------------------------
const UpdateSchema = z.object({
  approved: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { content: ["update"] });
    if (denied) return denied;

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return Err.validation("No fields to update");
    }

    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const outcome = await requireApprovalOrProceed(ctx, "content", "update", { kind: "testimonial", ...data }, id);
    if (!outcome.proceed) return Approval.queued(outcome.requestId);

    const t = await approvalExecutors["content:update"]({ kind: "testimonial", ...data }, id) as
      Awaited<ReturnType<typeof db.testimonial.update>>;
    return ok({ testimonial: t });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return Err.notFound("Testimonial");
    console.error("[admin/testimonials] PATCH error", e);
    reportError(e, { route: "PATCH /api/admin/testimonials/[id]" });
    return Err.internal();
  }
}