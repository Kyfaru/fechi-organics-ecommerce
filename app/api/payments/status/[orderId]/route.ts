/**
 * GET /api/payments/status/[orderId]
 *
 * Returns the current payment and order status for the given order.
 * The payment page polls this endpoint after initiating STK push.
 *
 * Requires an active session. The order must belong to the calling user.
 */

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  // 1. Authenticate
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const { orderId } = await params;

  if (!orderId) {
    return Err.validation("orderId is required");
  }

  try {
    // 2. Load the order — only fields the client needs
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        paymentStatus: true,
        status: true,
      },
    });

    if (!order) return Err.notFound("Order");

    // 3. Ownership check — users can only see their own orders
    if (order.userId !== session.user.id) return Err.forbidden();

    // 4. Load the most recent transaction for this order
    const transaction = await db.transaction.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        provider: true,
        mpesaReceiptNumber: true,
        failureReason: true,
      },
    });

    return ok({
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      transactionStatus: transaction?.status ?? null,
      provider: transaction?.provider ?? null,
      mpesaReceiptNumber: transaction?.mpesaReceiptNumber ?? null,
      failureReason: transaction?.failureReason ?? null,
    });
  } catch (e) {
    console.error("[payments/status] GET error", e);
    return Err.internal();
  }
}
