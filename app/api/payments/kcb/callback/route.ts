/**
 * POST /api/payments/kcb/callback
 *
 * Webhook called by KCB Buni after the customer responds to the STK push.
 * KCB uses a Safaricom-compatible callback structure. We always return
 * { ResultCode: 0 } so KCB does not retry. Idempotency is enforced by the
 * transaction status check.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { markPaymentSuccess, markPaymentFailed } from "@/lib/payments/post-payment";

export async function POST(req: NextRequest) {
  let body: {
    Body?: {
      stkCallback?: {
        CheckoutRequestID?: string;
        ResultCode?: number;
        ResultDesc?: string;
        CallbackMetadata?: {
          Item?: Array<{ Name: string; Value?: string | number }>;
        };
      };
    };
  };

  let rawText = "";
  try {
    rawText = await req.text();
    console.log("[kcb/callback] raw body:", rawText);
    body = JSON.parse(rawText) as typeof body;
  } catch {
    console.error("[kcb/callback] failed to parse body:", rawText);
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const callback = body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) {
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const checkoutRequestId = callback.CheckoutRequestID;
  const resultCode = callback.ResultCode ?? 1;

  try {
    const tx = await db.transaction.findFirst({
      where: { checkoutRequestId },
      select: { id: true, orderId: true, status: true },
    });

    if (!tx) return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
    if (tx.status !== "PENDING") return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

    const orderId = tx.orderId;

    if (resultCode === 0) {
      const items = callback.CallbackMetadata?.Item ?? [];
      const receiptNumber = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as
        | string
        | undefined;

      await markPaymentSuccess({
        transactionId: tx.id,
        orderId,
        transactionData: {
          status: "SUCCESS",
          mpesaReceiptNumber: receiptNumber ?? null,
          rawCallbackPayload: body as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    } else {
      await markPaymentFailed({
        transactionId: tx.id,
        orderId,
        reason: `${resultCode}:${callback.ResultDesc ?? 'Payment failed'}`,
      });
    }
  } catch (e) {
    console.error("[kcb/callback] error", e);
  }

  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
