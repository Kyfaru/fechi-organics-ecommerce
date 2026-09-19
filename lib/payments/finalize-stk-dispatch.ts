/**
 * Persists the outcome of dispatchStk() (lib/payments/dispatch-stk.ts) for
 * either flow — shared by the QStash worker (app/api/admin/workers/
 * dispatch-stk) and each initiate route's inline fallback for when QStash
 * itself isn't configured (publishQstashJSON returns null).
 */

import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { paymentChannel } from "@/lib/payment-channel";
import { publishQstashJSON } from "@/lib/qstash";
import { markPaymentFailed } from "@/lib/payments/post-payment";
import { markInStorePaymentFailed } from "@/lib/payments/instore-post-payment";
import { reportError } from "@/lib/observability";
import type { StkDispatchResult } from "@/lib/payments/dispatch-stk";

const ONLINE_TIMEOUT_SECONDS = 5 * 60; // matches the pre-existing PAYMENT_TIMEOUT_SECONDS in payments/mpesa/initiate
const INSTORE_TIMEOUT_SECONDS = 15 * 60; // matches instore/mpesa/initiate's PAYMENT_TIMEOUT_SECONDS

const PERSIST_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Persists the checkoutRequestId a real gateway call already returned. This
 * is the single riskiest write in the whole flow: by the time we're here, a
 * real STK prompt may already be on the customer's phone, so a transient DB
 * failure here — not retried — would mean the eventual callback (matched by
 * checkoutRequestId) can never find this transaction, even though the
 * customer may go on to actually pay. Retried a few times with a short
 * backoff; if it still fails, escalated loudly rather than thrown, so the
 * caller still attempts the SSE signal and timeout scheduling below instead
 * of abandoning those too on top of the persist failure.
 */
async function persistCheckoutRequestId(
  kind: "online" | "instore",
  transactionId: string,
  result: Extract<StkDispatchResult, { success: true }>,
): Promise<void> {
  for (let attempt = 1; attempt <= PERSIST_ATTEMPTS; attempt++) {
    try {
      if (kind === "online") {
        await db.transaction.update({
          where: { id: transactionId },
          data: { checkoutRequestId: result.checkoutRequestId, mpesaGatewayUsed: result.gatewayUsed },
        });
        await db.transactionEvent.create({
          data: { transactionId, type: "STK_SENT", detail: result.gatewayUsed },
        });
      } else {
        await db.inStoreTransaction.update({
          where: { id: transactionId },
          data: { checkoutRequestId: result.checkoutRequestId, mpesaGatewayUsed: result.gatewayUsed },
        });
        await db.inStoreTransactionEvent.create({
          data: { inStoreTransactionId: transactionId, type: "STK_SENT", detail: result.gatewayUsed },
        });
      }
      return;
    } catch (e) {
      if (attempt === PERSIST_ATTEMPTS) {
        reportError(e, {
          route: "finalizeStkDispatch",
          tags: { stage: "persist_checkout_request_id_exhausted", kind },
          extra: { transactionId, checkoutRequestId: result.checkoutRequestId, gatewayUsed: result.gatewayUsed },
        });
        console.error(
          `[finalize-stk-dispatch] CRITICAL: could not persist checkoutRequestId=${result.checkoutRequestId} for ${kind} transaction=${transactionId} after ${PERSIST_ATTEMPTS} attempts — a real STK prompt was sent but the callback has nothing to match it to. Manual reconciliation required.`,
          e,
        );
        return; // don't throw — the SSE signal and timeout scheduling below are still worth attempting
      }
      console.warn(`[finalize-stk-dispatch] persist attempt ${attempt}/${PERSIST_ATTEMPTS} failed for transaction=${transactionId}, retrying`, e);
      await sleep(150 * attempt);
    }
  }
}

export async function finalizeStkDispatch(args: {
  kind: "online" | "instore";
  transactionId: string;
  orderId: string;
  result: StkDispatchResult;
}): Promise<void> {
  const { kind, transactionId, orderId, result } = args;

  if (!result.success) {
    const reason = `${result.gatewayAttempted}: ${result.reason}`;
    if (kind === "online") {
      await markPaymentFailed({ transactionId, orderId, reason });
    } else {
      await markInStorePaymentFailed({ transactionId, inStoreOrderId: orderId, reason });
    }
    return;
  }

  await persistCheckoutRequestId(kind, transactionId, result);

  // Notify the waiting SSE stream that the prompt is on its way — must not
  // throw if Redis is unavailable (matches lib/payments/post-payment.ts).
  //
  // NX: the callback can, in principle, arrive and write a terminal
  // payment_success/payment_failed to this same key before this write runs
  // (gateway-accept → push-delivery → customer PIN entry → callback beating
  // this function's own DB writes + Redis set — human-timescale-unlikely but
  // not impossible under latency). Without NX, this non-terminal write would
  // silently clobber that terminal one, and the SSE stream would hang on
  // "stk_sent" forever despite the order already being correctly resolved in
  // the DB — exactly the kind of stuck UI that prompts a customer to retry
  // and risk a double charge. NX means whichever write lands first wins, and
  // a terminal state can never be overwritten by this non-terminal one.
  try {
    await getRedis().set(
      paymentChannel(orderId),
      JSON.stringify({
        type: kind === "online" ? "stk_sent" : "instore_stk_sent",
        orderId,
        transactionId,
        gateway: result.gatewayUsed,
        timestamp: Date.now(),
      }),
      { ex: 900, nx: true },
    );
  } catch (e) {
    console.error("[finalize-stk-dispatch] Redis set failed (stk_sent):", e);
  }

  // Schedule the abandonment timeout only now that a prompt actually went
  // out — previously this was scheduled unconditionally right after order
  // creation, which could fire before dispatch even happened.
  await publishQstashJSON(
    kind === "online" ? "/api/admin/workers/check-failed-payment" : "/api/admin/workers/check-failed-instore-payment",
    kind === "online" ? { orderId, transactionId } : { inStoreOrderId: orderId, transactionId },
    { delay: kind === "online" ? ONLINE_TIMEOUT_SECONDS : INSTORE_TIMEOUT_SECONDS },
  );
}
