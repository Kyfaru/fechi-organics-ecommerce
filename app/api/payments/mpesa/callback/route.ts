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

    // Update transaction and order in a single transaction for atomicity
    await db.$transaction([
      db.transaction.update({
        where: { id: transaction.id },
        data: {
          status: isSuccess ? "SUCCESS" : "FAILED",
          mpesaReceiptNumber: mpesaReceiptNumber ?? null,
          failureReason: isSuccess ? null : ResultDesc,
          rawCallbackPayload: body as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      }),
      db.order.update({
        where: { id: transaction.orderId },
        data: {
          paymentStatus: isSuccess ? "PAID" : "FAILED",
          // Only mark CONFIRMED if payment succeeded; otherwise leave as PENDING
          // so the customer can retry
          status: isSuccess ? "CONFIRMED" : "PENDING",
        },
      }),
    ]);

    console.info(
      `[mpesa/callback] Processed — tx=${transaction.id} success=${isSuccess} receipt=${mpesaReceiptNumber ?? "N/A"}`,
    );
  } catch (e) {
    // Log but do NOT return a non-200 — Safaricom must not retry
    console.error("[mpesa/callback] Processing error", e);
  }

  return safaricomOk();
}
