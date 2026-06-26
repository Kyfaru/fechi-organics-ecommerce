/**
 * GET /api/payments/paystack/verify?reference=...
 *
 * Called when the customer returns from Paystack's hosted checkout. Verifies
 * the transaction server-side and redirects to the success/error page.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { markPaymentSuccess, markPaymentFailed } from "@/lib/payments/post-payment";
import { verifyTransaction } from "@/lib/paystack/client";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));

  const reference = req.nextUrl.searchParams.get("reference");
  if (!reference) return NextResponse.redirect(new URL("/payment?error=missing_reference", req.url));

  try {
    const tx = await db.transaction.findFirst({
      where: { paystackReference: reference },
      include: { order: { select: { id: true, userId: true } } },
    });

    if (!tx) return NextResponse.redirect(new URL("/payment?error=not_found", req.url));
    if (tx.order.userId !== session.user.id) {
      return NextResponse.redirect(new URL("/payment?error=forbidden", req.url));
    }

    const orderId = tx.order.id;

    // Idempotency
    if (tx.status === "SUCCESS") {
      return NextResponse.redirect(new URL(`/order-success/${orderId}`, req.url));
    }

    const paystackRes = await verifyTransaction(reference);

    if (paystackRes.data.status === "success") {
      await markPaymentSuccess({
        transactionId: tx.id,
        orderId,
        transactionData: {
          status: "SUCCESS",
          paystackReference: reference,
          rawCallbackPayload: paystackRes.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
      return NextResponse.redirect(new URL(`/order-success/${orderId}`, req.url));
    } else {
      await markPaymentFailed({ transactionId: tx.id, orderId });
      return NextResponse.redirect(new URL("/payment?error=payment_failed", req.url));
    }
  } catch (e) {
    console.error("[paystack/verify] GET error", e);
    return NextResponse.redirect(new URL("/payment?error=verify_failed", req.url));
  }
}
