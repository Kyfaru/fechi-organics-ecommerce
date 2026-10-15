/**
 * POST /api/payments/kcb/callback
 *
 * Webhook called by KCB Buni after the customer responds to the STK push.
 * KCB uses a Safaricom-compatible callback structure. We always return
 * { ResultCode: 0 } so KCB does not retry.
 *
 * Order of operations (ack-first design):
 *   1. file the raw payload in paymentCallbackInbox (durable proof of receipt)
 *   2. look the transaction up by CheckoutRequestID, falling back to the
 *      signed ?tx= id (covers a callback beating the checkoutRequestId write)
 *   3. verify the paid amount, then mark success/failed. markPaymentSuccess
 *      is an atomic compare-and-set, so duplicates are harmless.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { markPaymentSuccess, markPaymentFailed } from "@/lib/payments/post-payment";
import { reportError } from "@/lib/observability";
import { trackServerEvent, logServerError } from "@/lib/observability-server";
import { createNotification } from "@/lib/notify";
import {
  amountMatches,
  fileCallback,
  settleCallback,
  signatureEnforced,
  verifySignature,
} from "@/lib/payments/callback-guard";

const ACK = () => Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

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
  } catch (parseErr) {
    reportError(parseErr, { route: "POST /api/payments/kcb/callback", tags: { stage: "body_parse" } });
    console.error("[kcb/callback] failed to parse body:", rawText);
    return ACK();
  }

  const callback = body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) return ACK();

  const checkoutRequestId = callback.CheckoutRequestID;
  const resultCode = callback.ResultCode ?? 1;

  const txHint = req.nextUrl.searchParams.get("tx");
  const hmacOk = verifySignature(txHint, req.nextUrl.searchParams.get("sig"));
  const inbox = await fileCallback({ source: "kcb", checkoutRequestId, resultCode, raw: body, hmacOk });
  let outcome = "processed";

  try {
    if (hmacOk === false && signatureEnforced()) {
      console.warn(`[kcb/callback] bad signature — rejected checkoutRequestId=${checkoutRequestId}`);
      outcome = "rejected_signature";
      return ACK();
    }
    if (hmacOk === false) {
      console.warn(`[kcb/callback] bad signature (not enforced) checkoutRequestId=${checkoutRequestId}`);
    }

    const select = {
      id: true,
      orderId: true,
      status: true,
      amount: true,
      order: { select: { userId: true, branchId: true, guestEmail: true, user: { select: { name: true } } } },
    } as const;
    let tx = await db.transaction.findFirst({ where: { checkoutRequestId }, select });
    // Callback beat the checkoutRequestId write — match by the signed tx id,
    // and only when the signature actually verified.
    if (!tx && txHint && hmacOk === true) {
      tx = await db.transaction.findUnique({ where: { id: txHint }, select });
    }

    if (!tx) {
      console.warn(
        `[kcb/callback] Unknown CheckoutRequestID: ${checkoutRequestId} merchantRequestId=${(callback as { MerchantRequestID?: string }).MerchantRequestID ?? "N/A"} resultCode=${resultCode}`,
      );
      outcome = "unknown_ref";
      return ACK();
    }
    if (tx.status !== "PENDING" && !(tx.status === "FAILED" && resultCode === 0)) {
      // Terminal already. (A success arriving for a FAILED tx is allowed
      // through: markPaymentSuccess recovers timeout-failed ones.)
      outcome = "duplicate";
      return ACK();
    }

    const orderId = tx.orderId;
    const distinctId = tx.order?.userId ?? "system";

    if (resultCode === 0) {
      const items = callback.CallbackMetadata?.Item ?? [];
      const receiptNumber = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as
        | string
        | undefined;
      const paidAmount = items.find((i) => i.Name === "Amount")?.Value;

      if (!amountMatches(paidAmount, tx.amount)) {
        // Money moved but not the amount we expected — never auto-confirm.
        outcome = "amount_mismatch";
        console.error(
          `[kcb/callback] AMOUNT MISMATCH tx=${tx.id} expectedCents=${tx.amount} paidKes=${String(paidAmount)} receipt=${receiptNumber ?? "N/A"}`,
        );
        await createNotification({
          type: "PAYMENT_ERROR",
          title: `Payment amount mismatch — order #${orderId.slice(0, 8).toUpperCase()}`,
          body: `M-Pesa receipt ${receiptNumber ?? "N/A"} paid KES ${String(paidAmount)} but the order expects KES ${tx.amount / 100}. Not auto-confirmed — reconcile manually.`,
          link: `/admin/orders/${orderId}`,
          branchId: tx.order?.branchId ?? null,
        });
        return ACK();
      }

      await markPaymentSuccess({
        transactionId: tx.id,
        orderId,
        transactionData: {
          status: "SUCCESS",
          mpesaReceiptNumber: receiptNumber ?? null,
          rawCallbackPayload: body as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
      trackServerEvent(distinctId, "payment_succeeded", { provider: "kcb", orderId, transactionId: tx.id });
    } else {
      await markPaymentFailed({
        transactionId: tx.id,
        orderId,
        reason: `${resultCode}:${callback.ResultDesc ?? 'Payment failed'}`,
      });
      trackServerEvent(distinctId, "payment_failed", {
        provider: "kcb",
        orderId,
        transactionId: tx.id,
        reason: `${resultCode}:${callback.ResultDesc ?? 'Payment failed'}`,
      });
      const customerLabel = tx.order?.user?.name ?? tx.order?.guestEmail ?? "A customer";
      await createNotification({
        type: "PAYMENT_ERROR",
        title: `Payment failed — order #${orderId.slice(0, 8).toUpperCase()}`,
        body: `${customerLabel}'s KCB payment failed: ${callback.ResultDesc ?? "Payment failed"}`,
        link: `/admin/orders/${orderId}`,
        branchId: tx.order?.branchId ?? null,
      });
    }
  } catch (e) {
    outcome = "error";
    reportError(e, { route: "POST /api/payments/kcb/callback", tags: { stage: "handler" } });
    void logServerError(e, { route: "POST /api/payments/kcb/callback" });
    console.error("[kcb/callback] error", e);
  } finally {
    await settleCallback(inbox.id, outcome);
  }

  return ACK();
}
