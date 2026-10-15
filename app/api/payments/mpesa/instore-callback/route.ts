/**
 * POST /api/payments/mpesa/instore-callback
 *
 * Webhook endpoint called by Safaricom (Daraja) OR KCB Buni after a walk-in
 * customer responds to an admin-initiated in-store STK push — in-store
 * initiate uses the same callback URL for both gateways (see
 * app/api/admin/orders/instore/mpesa/initiate/route.ts's dual-gateway
 * dispatch on branch.mpesaGateway), so this single endpoint must be able to
 * process whichever provider actually sent the transaction. This is NOT
 * authenticated — both providers call it directly.
 *
 * Both providers' STK callbacks use the identical Safaricom-style
 * Body.stkCallback.{CheckoutRequestID,ResultCode,ResultDesc,
 * CallbackMetadata.Item[].{Name,Value}} envelope, so one parser serves both
 * (the branch's mpesaGateway is still logged per processed callback).
 *
 * Ack-first: the raw payload is filed in paymentCallbackInbox before any
 * business logic; the transaction is matched by CheckoutRequestID, falling
 * back to the signed ?tx= id; the paid amount is verified; and
 * markInStorePaymentSuccess is an atomic compare-and-set.
 *
 * We ALWAYS return HTTP 200 with { ResultCode: 0 }. If we return anything
 * else, both providers retry indefinitely.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  markInStorePaymentFailed,
  markInStorePaymentSuccess,
} from "@/lib/payments/instore-post-payment";
import { reportError } from "@/lib/observability";
import { trackServerEvent } from "@/lib/observability-server";
import {
  amountMatches,
  fileCallback,
  settleCallback,
  signatureEnforced,
  verifySignature,
} from "@/lib/payments/callback-guard";

function safaricomOk() {
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
}

type RawStkCallback = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: number;
  ResultDesc?: string;
  CallbackMetadata?: { Item?: Array<{ Name: string; Value?: unknown }> };
};

function extractStkCallback(body: unknown): RawStkCallback | undefined {
  const callback = (body as Record<string, unknown>)?.Body as Record<string, unknown> | undefined;
  return callback?.stkCallback as RawStkCallback | undefined;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    const rawText = await req.text();
    console.log("[mpesa/instore-callback] raw body:", rawText);
    body = JSON.parse(rawText);
  } catch (parseErr) {
    reportError(parseErr, { route: "POST /api/payments/mpesa/instore-callback", tags: { stage: "body_parse" } });
    // Malformed JSON — still return 200 so the provider doesn't retry
    return safaricomOk();
  }

  const stk = extractStkCallback(body);
  if (!stk?.CheckoutRequestID) {
    console.warn("[mpesa/instore-callback] Unexpected payload shape", body);
    return safaricomOk();
  }

  const checkoutRequestId = stk.CheckoutRequestID;
  const resultCode = stk.ResultCode ?? 1;
  const resultDesc = stk.ResultDesc ?? "Payment failed";
  const items = stk.CallbackMetadata?.Item ?? [];
  const receiptNumber = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as string | undefined;
  const paidAmount = items.find((i) => i.Name === "Amount")?.Value;

  const txHint = req.nextUrl.searchParams.get("tx");
  const hmacOk = verifySignature(txHint, req.nextUrl.searchParams.get("sig"));
  const inbox = await fileCallback({ source: "instore-stk", checkoutRequestId, resultCode, raw: body, hmacOk });
  let outcome = "processed";

  try {
    if (hmacOk === false && signatureEnforced()) {
      console.warn(`[mpesa/instore-callback] bad signature — rejected checkoutRequestId=${checkoutRequestId}`);
      outcome = "rejected_signature";
      return safaricomOk();
    }
    if (hmacOk === false) {
      console.warn(`[mpesa/instore-callback] bad signature (not enforced) checkoutRequestId=${checkoutRequestId}`);
    }

    const select = {
      id: true,
      inStoreOrderId: true,
      status: true,
      amount: true,
      inStoreOrder: {
        select: { branch: { select: { mpesaGateway: true } }, branchId: true, customerUserId: true, customerName: true },
      },
    } as const;
    let transaction = await db.inStoreTransaction.findUnique({ where: { checkoutRequestId }, select });
    // Callback beat the checkoutRequestId write — match by the signed tx id,
    // and only when the signature actually verified.
    if (!transaction && txHint && hmacOk === true) {
      transaction = await db.inStoreTransaction.findUnique({ where: { id: txHint }, select });
    }

    if (!transaction) {
      console.warn(
        `[mpesa/instore-callback] Unknown CheckoutRequestID: ${checkoutRequestId} merchantRequestId=${stk.MerchantRequestID ?? "N/A"} resultCode=${resultCode}`,
      );
      outcome = "unknown_ref";
      return safaricomOk();
    }

    // Idempotency — only PENDING is processed. (A success for a FAILED tx is
    // let through: markInStorePaymentSuccess recovers timeout-failed ones.)
    if (transaction.status !== "PENDING" && !(transaction.status === "FAILED" && resultCode === 0)) {
      console.info(
        `[mpesa/instore-callback] Already processed — tx=${transaction.id} status=${transaction.status}`,
      );
      outcome = "duplicate";
      return safaricomOk();
    }

    const isSuccess = resultCode === 0;

    if (isSuccess && !amountMatches(paidAmount, transaction.amount)) {
      outcome = "amount_mismatch";
      console.error(
        `[mpesa/instore-callback] AMOUNT MISMATCH tx=${transaction.id} expectedCents=${transaction.amount} paidKes=${String(paidAmount)} receipt=${receiptNumber ?? "N/A"}`,
      );
      return safaricomOk();
    }

    const transactionData = {
      status: isSuccess ? "SUCCESS" : "FAILED",
      mpesaReceiptNumber: receiptNumber ?? null,
      failureReason: isSuccess ? null : `${resultCode}:${resultDesc}`,
      rawCallbackPayload: body as unknown as import("@prisma/client").Prisma.InputJsonValue,
    } as const;

    // Walk-in customers aren't authenticated — fall back to "system" when the
    // in-store order has no linked customerUserId.
    const distinctId = transaction.inStoreOrder.customerUserId ?? "system";

    if (isSuccess) {
      await markInStorePaymentSuccess({
        transactionId: transaction.id,
        inStoreOrderId: transaction.inStoreOrderId,
        transactionData,
      });
      trackServerEvent(distinctId, "payment_succeeded", {
        provider: "mpesa_instore",
        inStoreOrderId: transaction.inStoreOrderId,
        transactionId: transaction.id,
      });
    } else {
      await markInStorePaymentFailed({
        transactionId: transaction.id,
        inStoreOrderId: transaction.inStoreOrderId,
        reason: `${resultCode}:${resultDesc}`,
      });
      trackServerEvent(distinctId, "payment_failed", {
        provider: "mpesa_instore",
        inStoreOrderId: transaction.inStoreOrderId,
        transactionId: transaction.id,
        reason: `${resultCode}:${resultDesc}`,
      });
      // In-store: staff are physically at the register, so no admin
      // "payment failed" alert here (unlike the online M-Pesa callback).
    }

    console.info(
      `[mpesa/instore-callback] Processed — tx=${transaction.id} gateway=${transaction.inStoreOrder.branch.mpesaGateway} success=${isSuccess} receipt=${receiptNumber ?? "N/A"}`,
    );
  } catch (e) {
    outcome = "error";
    reportError(e, { route: "POST /api/payments/mpesa/instore-callback", tags: { stage: "handler" } });
    // Log but do NOT return a non-200 — neither provider should retry
    console.error("[mpesa/instore-callback] Processing error", e);
  } finally {
    await settleCallback(inbox.id, outcome);
  }

  return safaricomOk();
}
