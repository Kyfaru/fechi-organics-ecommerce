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
 * Payload parsing is split into two named branches (parseDarajaCallback /
 * parseKcbCallback) mirroring the two customer-facing reference routes
 * (app/api/payments/mpesa/callback/route.ts and
 * app/api/payments/kcb/callback/route.ts respectively — neither is imported
 * from or modified here, they power the customer checkout flow). As of this
 * writing both providers' STK callbacks use the identical Safaricom-style
 * Body.stkCallback.{CheckoutRequestID,ResultCode,ResultDesc,
 * CallbackMetadata.Item[].{Name,Value}} envelope (KCB Buni's callback is
 * itself Safaricom-compatible per the KCB reference route), so both parsers
 * currently produce the same result — kept as two explicit branches rather
 * than one shared parse specifically so the code visibly mirrors the
 * outbound dispatch's gateway split and so either provider's shape can
 * diverge independently in the future without restructuring this route.
 * The transaction's own branch.mpesaGateway is looked up and logged
 * alongside every processed callback for diagnostic clarity, independent of
 * which parser happened to match.
 *
 * We ALWAYS return HTTP 200 with { ResultCode: 0 }. If we return anything
 * else, both providers retry indefinitely. Idempotency is enforced by
 * checking the transaction status before updating.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  markInStorePaymentFailed,
  markInStorePaymentSuccess,
} from "@/lib/payments/instore-post-payment";

function safaricomOk() {
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
}

type StkCallbackFields = {
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  receiptNumber?: string;
};

type RawStkCallback = {
  CheckoutRequestID?: string;
  ResultCode?: number;
  ResultDesc?: string;
  CallbackMetadata?: { Item?: Array<{ Name: string; Value?: unknown }> };
};

function extractStkCallback(body: unknown): RawStkCallback | undefined {
  const callback = (body as Record<string, unknown>)?.Body as Record<string, unknown> | undefined;
  return callback?.stkCallback as RawStkCallback | undefined;
}

// Mirrors app/api/payments/mpesa/callback/route.ts's field access exactly.
function parseDarajaCallback(body: unknown): StkCallbackFields | null {
  const stkCallback = extractStkCallback(body);
  if (!stkCallback?.CheckoutRequestID) return null;
  const receiptItem = stkCallback.CallbackMetadata?.Item?.find((i) => i.Name === "MpesaReceiptNumber");
  return {
    checkoutRequestId: stkCallback.CheckoutRequestID,
    resultCode: stkCallback.ResultCode ?? 1,
    resultDesc: stkCallback.ResultDesc ?? "Payment failed",
    receiptNumber: receiptItem?.Value as string | undefined,
  };
}

// Mirrors app/api/payments/kcb/callback/route.ts's field access exactly —
// KCB Buni's STK callback is Safaricom-compatible, same envelope, same
// "MpesaReceiptNumber" metadata key (KCB Buni brokers actual M-Pesa
// payments under the hood).
function parseKcbCallback(body: unknown): StkCallbackFields | null {
  const stkCallback = extractStkCallback(body);
  if (!stkCallback?.CheckoutRequestID) return null;
  const receiptItem = stkCallback.CallbackMetadata?.Item?.find((i) => i.Name === "MpesaReceiptNumber");
  return {
    checkoutRequestId: stkCallback.CheckoutRequestID,
    resultCode: stkCallback.ResultCode ?? 1,
    resultDesc: stkCallback.ResultDesc ?? "Payment failed",
    receiptNumber: receiptItem?.Value as string | undefined,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Malformed JSON — still return 200 so the provider doesn't retry
    return safaricomOk();
  }

  try {
    const parsed = parseDarajaCallback(body) ?? parseKcbCallback(body);
    if (!parsed) {
      // Unexpected shape from either provider — log and accept
      console.warn("[mpesa/instore-callback] Unexpected payload shape", body);
      return safaricomOk();
    }

    const { checkoutRequestId, resultCode, resultDesc, receiptNumber } = parsed;

    // Look up the in-store transaction by CheckoutRequestID, including the
    // branch's gateway purely for diagnostic logging below.
    const transaction = await db.inStoreTransaction.findUnique({
      where: { checkoutRequestId },
      select: {
        id: true,
        inStoreOrderId: true,
        status: true,
        inStoreOrder: { select: { branch: { select: { mpesaGateway: true } } } },
      },
    });

    if (!transaction) {
      console.warn(`[mpesa/instore-callback] Unknown CheckoutRequestID: ${checkoutRequestId}`);
      return safaricomOk();
    }

    // Idempotency — only process PENDING transactions
    if (transaction.status !== "PENDING") {
      console.info(
        `[mpesa/instore-callback] Already processed — tx=${transaction.id} status=${transaction.status}`,
      );
      return safaricomOk();
    }

    const isSuccess = resultCode === 0;

    const transactionData = {
      status: isSuccess ? "SUCCESS" : "FAILED",
      mpesaReceiptNumber: receiptNumber ?? null,
      failureReason: isSuccess ? null : `${resultCode}:${resultDesc}`,
      rawCallbackPayload: body as unknown as import("@prisma/client").Prisma.InputJsonValue,
    } as const;

    if (isSuccess) {
      await markInStorePaymentSuccess({
        transactionId: transaction.id,
        inStoreOrderId: transaction.inStoreOrderId,
        transactionData,
      });
    } else {
      await markInStorePaymentFailed({
        transactionId: transaction.id,
        inStoreOrderId: transaction.inStoreOrderId,
        reason: `${resultCode}:${resultDesc}`,
      });
    }

    console.info(
      `[mpesa/instore-callback] Processed — tx=${transaction.id} gateway=${transaction.inStoreOrder.branch.mpesaGateway} success=${isSuccess} receipt=${receiptNumber ?? "N/A"}`,
    );
  } catch (e) {
    // Log but do NOT return a non-200 — neither provider should retry
    console.error("[mpesa/instore-callback] Processing error", e);
  }

  return safaricomOk();
}
