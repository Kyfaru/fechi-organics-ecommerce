import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { promotionPatchSchema } from "@/lib/promotions/schema";
import { reportError } from "@/lib/observability";

/**
 * PATCH /api/admin/promotions/[id]
 *
 * Routed through the approval queue, same as POST. Previously this wrote
 * straight to the database, which meant any role holding `promotions:update`
 * could create a coupon with 0 points and then edit points onto it — making the
 * approval gate on create decorative.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { promotions: ["update"] });
  if (denied) return denied;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  const parsed = promotionPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return Err.validation(parsed.error.issues[0]?.message ?? "Invalid promotion");
  }
  const body = parsed.data;

  try {
    const existing = await db.promotion.findUnique({
      where: { id },
      select: { ownerUserId: true, disabledAt: true },
    });
    if (!existing) return Err.notFound("Promotion");

    // Customer coupons are a customer's own referral code. They are viewable
    // and can be disabled, but never edited — the terms are the programme's,
    // not an individual staff member's to change.
    if (existing.ownerUserId !== null) {
      return Err.validation("Customer coupons can't be edited. Disable it instead.");
    }

    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const outcome = await requireApprovalOrProceed(ctx, "promotions", "update", body, id);
    if (!outcome.proceed) return Approval.queued(outcome.requestId);

    const promotion = await approvalExecutors["promotions:update"](body, id);
    console.info(`[promotions/PATCH] Updated promotion: ${id}`);
    return ok(promotion);
  } catch (e) {
    console.error("[promotions/PATCH]", e);
    reportError(e, { route: "PATCH /api/admin/promotions/[id]", extra: { promotionId: id } });
    return Err.internal();
  }
}

/**
 * DELETE /api/admin/promotions/[id] — soft delete.
 *
 * This used to be a hard `db.promotion.delete`. `couponRedemption` holds a bare
 * `couponId` string with no foreign key, so a hard delete orphaned every
 * redemption pointing at the coupon and destroyed the record of who used it.
 * Disabling keeps the audit trail and is reversible.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { promotions: ["delete"] });
  if (denied) return denied;

  const { id } = await params;

  try {
    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    await db.promotion.update({
      where: { id },
      data: {
        disabledAt: new Date(),
        disabledByAdminProfileId: ctx.id,
        status: "inactive",
      },
    });
    console.info(`[promotions/DELETE] Disabled promotion: ${id}`);
    return ok({ disabled: true });
  } catch (e) {
    console.error("[promotions/DELETE]", e);
    reportError(e, { route: "DELETE /api/admin/promotions/[id]", extra: { promotionId: id } });
    return Err.internal();
  }
}
