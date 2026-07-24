/**
 * POST /api/admin/orders/instore/[id]/cancel-wait
 *
 * Called by the admin waiting-modal's "Cancel" button (shown after 15s of no
 * confirmation) to abandon a still-PENDING STK/Paystack attempt so the admin
 * can retry or start over. Admin-only.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { markInStorePaymentFailed } from "@/lib/payments/instore-post-payment";
import { requirePermission } from "@/lib/require-permission";

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  return user?.role === "admin" ? user : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const denied = await requirePermission(req, { orders: ["cancel"] });
  if (denied) return denied;

  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  const { id } = await params;

  try {
    const tx = await db.inStoreTransaction.findFirst({
      where: { inStoreOrderId: id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    // Nothing pending — either already resolved or never started. Either
    // way there's nothing to cancel.
    if (!tx) return ok({});

    await markInStorePaymentFailed({
      transactionId: tx.id,
      inStoreOrderId: id,
      reason: "Cancelled by admin while waiting",
    });

    return ok({});
  } catch (e) {
    console.error("[instore/cancel-wait] POST error", e);
    return Err.internal(e);
  }
}
