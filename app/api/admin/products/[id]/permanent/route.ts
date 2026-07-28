import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { logActivity } from "@/lib/admin-activity";

// ---------------------------------------------------------------------------
// GET /api/admin/products/[id]/permanent
// Order-history check the confirm-flow uses before showing the slug-confirm
// step — a permanent delete is blocked entirely when this is true.
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  const denied = await requirePermission(req, { products: ["delete"] });
  if (denied) return denied;

  try {
    const { id } = await params;
    const orderCount = await db.orderItem.count({ where: { productId: id } });
    return ok({ hasOrders: orderCount > 0 });
  } catch (e) {
    console.error("[admin/products/[id]/permanent] GET error", e);
    return Err.internal(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/products/[id]/permanent
// Hard-delete: only allowed once the product is already deactivated, and
// only when it has no order history (orderItem has a Restrict FK on
// productId, and order records must never lose their line items). Products
// with orders stay soft-deleted (isActive: false) forever — that already
// hides them from the store while preserving order integrity.
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { products: ["delete"] });
  if (denied) return denied;

  try {
    const { id } = await params;

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return Err.notFound("Product");
    if (existing.isActive) return Err.validation("Deactivate the product before deleting.");

    const orderCount = await db.orderItem.count({ where: { productId: id } });
    if (orderCount > 0) {
      return Err.validation("This product has order history and can't be permanently deleted.");
    }

    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const outcome = await requireApprovalOrProceed(ctx, "products", "delete", { slug: existing.slug }, id);
    if (!outcome.proceed) return Approval.queued(outcome.requestId);

    await approvalExecutors["products:delete"]({ slug: existing.slug }, id);

    console.info("[admin/products/[id]/permanent] DELETE (hard) —", id);
    logActivity(ctx.id, `Permanently deleted product "${existing.name}"`, "product", id, req);
    return ok({ id });
  } catch (e) {
    console.error("[admin/products/[id]/permanent] DELETE error", e);
    return Err.internal(e);
  }
}
