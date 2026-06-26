/**
 * POST /api/payments/mpesa/callback
 *
 * Webhook endpoint called by Safaricom after a customer responds to the STK
 * push prompt. This is NOT authenticated — Safaricom calls it directly.
 *
 * We ALWAYS return HTTP 200 with { ResultCode: 0 }. If we return anything
 * else, Safaricom retries indefinitely. Idempotency is enforced by checking
 * the transaction status before updating.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { markPaymentFailed, markPaymentSuccess } from "@/lib/payments/post-payment";

function safaricomOk() {
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Malformed JSON — still return 200 so Safaricom doesn't retry
    return safaricomOk();
  }

  try {
    // Safaricom wraps the callback under Body.stkCallback
    const callback = (body as Record<string, unknown>)?.Body as
      | Record<string, unknown>
      | undefined;
    const stkCallback = callback?.stkCallback as
      | {
          CheckoutRequestID: string;
          ResultCode: number;
          ResultDesc: string;
          CallbackMetadata?: { Item: Array<{ Name: string; Value: unknown }> };
        }
      | undefined;

    if (!stkCallback?.CheckoutRequestID) {
      // Unexpected shape — log and accept
      console.warn("[mpesa/callback] Unexpected payload shape", body);
      return safaricomOk();
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    // Look up the transaction by CheckoutRequestID
    const transaction = await db.transaction.findUnique({
      where: { checkoutRequestId: CheckoutRequestID },
      select: { id: true, orderId: true, status: true, mpesaReceiptNumber: true },
    });

    if (!transaction) {
      console.warn(`[mpesa/callback] Unknown CheckoutRequestID: ${CheckoutRequestID}`);
      return safaricomOk();
    }

    // Idempotency — only process PENDING transactions
    if (transaction.status !== "PENDING") {
      console.info(
        `[mpesa/callback] Already processed — tx=${transaction.id} status=${transaction.status}`,
      );
      return safaricomOk();
    }

    const isSuccess = ResultCode === 0;

    // Extract the M-Pesa receipt number from the callback metadata
    let mpesaReceiptNumber: string | undefined;
    if (isSuccess && CallbackMetadata?.Item) {
      const receiptItem = CallbackMetadata.Item.find(
        (i) => i.Name === "MpesaReceiptNumber",
      );
      mpesaReceiptNumber = receiptItem?.Value as string | undefined;
    }

    const transactionData = {
      status: isSuccess ? "SUCCESS" : "FAILED",
      mpesaReceiptNumber: mpesaReceiptNumber ?? null,
      failureReason: isSuccess ? null : `${ResultCode}:${ResultDesc}`,
      rawCallbackPayload: body as unknown as import("@prisma/client").Prisma.InputJsonValue,
    } as const;

    if (isSuccess) {
      await markPaymentSuccess({
        transactionId: transaction.id,
        orderId: transaction.orderId,
        transactionData,
      });
    } else {
      await markPaymentFailed({
        transactionId: transaction.id,
        orderId: transaction.orderId,
        reason: `${ResultCode}:${ResultDesc}`,
      });
    }

    console.info(
      `[mpesa/callback] Processed — tx=${transaction.id} success=${isSuccess} receipt=${mpesaReceiptNumber ?? "N/A"}`,
    );
  } catch (e) {
    // Log but do NOT return a non-200 — Safaricom must not retry
    console.error("[mpesa/callback] Processing error", e);
  }

  return safaricomOk();
}
