// Runs 15 minutes after an in-store M-Pesa STK push / Paystack charge is
// initiated (scheduled via Qstash delay from the instore mpesa/initiate and
// paystack/initialize routes). If the transaction is still PENDING at that
// point, the walk-in customer abandoned the payment with no callback — flip
// the order to FAILED so it doesn't linger forever. Mirrors
// check-failed-payment/route.ts's shape for the online-order flow.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { markInStorePaymentFailed } from "@/lib/payments/instore-post-payment";
import { createNotification } from "@/lib/notify";
import { reportError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { inStoreOrderId, transactionId } = JSON.parse(rawBody) as {
    inStoreOrderId: string;
    transactionId: string;
  };

  try {
    const transaction = await db.inStoreTransaction.findUnique({
      where: { id: transactionId },
      select: { status: true },
    });
    // Already resolved (success, admin-cancelled, or otherwise) before the
    // 15-minute window elapsed.
    if (!transaction || transaction.status !== "PENDING") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await markInStorePaymentFailed({
      transactionId,
      inStoreOrderId,
      reason: "Payment timed out after 15 minutes with no callback",
    });

    const order = await db.inStoreOrder.findUnique({
      where: { id: inStoreOrderId },
      select: { orderNumber: true, branchId: true, customerName: true, customerPhone: true },
    });
    if (order) {
      await createNotification({
        type: "PAYMENT_ERROR",
        title: `In-store payment failed — ${order.orderNumber ?? inStoreOrderId}`,
        body: `${order.customerName ?? order.customerPhone ?? "A walk-in customer"}'s payment timed out with no callback.`,
        link: "/admin/orders",
        branchId: order.branchId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    reportError(error, {
      route: "POST /api/admin/workers/check-failed-instore-payment",
      extra: { inStoreOrderId, transactionId },
    });
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
