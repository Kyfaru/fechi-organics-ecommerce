/**
 * The dispatch-stk job body, shared by two entry points so the STK push can
 * start the moment the order exists instead of waiting on the QStash hop:
 *  - app/api/admin/workers/dispatch-stk (QStash-delivered, durable)
 *  - the initiate routes' after() fast path (runs right after the response)
 * Whichever starts first takes the Redis NX claim below; the other sees
 * "already claimed" and exits, so a prompt can never be sent twice.
 */

import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { assertGatewayEnv } from "@/lib/payments/gateway-env";
import { resolveMpesaGateway } from "@/lib/payments/mpesa/gateway";
import { dispatchStk, type StkDispatchResult } from "@/lib/payments/dispatch-stk";
import { finalizeStkDispatch } from "@/lib/payments/finalize-stk-dispatch";
import { signedCallbackUrl } from "@/lib/payments/callback-guard";
import { reportError } from "@/lib/observability";

export type DispatchJobResult = { httpStatus: number; body: Record<string, unknown> };

export async function runDispatchJob(
  kind: "online" | "instore",
  transactionId: string,
): Promise<DispatchJobResult> {
  let claimed: unknown;
  try {
    claimed = await getRedis().set(`stk_dispatch:${transactionId}`, "1", { nx: true, ex: 300 });
  } catch (redisErr) {
    // Nothing claimed, nothing dispatched — safe to let QStash retry.
    reportError(redisErr, { route: "POST /api/admin/workers/dispatch-stk", tags: { stage: "claim" } });
    return { httpStatus: 503, body: { error: "Redis unavailable" } };
  }
  if (!claimed) {
    return { httpStatus: 200, body: { ok: true, skipped: "already claimed" } };
  }

  // From here on, the claim is held for 300s regardless of what happens
  // below — always return 200 so QStash never retries into a second
  // dispatch. Any genuinely unresolved transaction is caught by the
  // existing check-failed-payment / check-failed-instore-payment timeout
  // sweep instead.
  try {
    if (kind === "online") {
      const transaction = await db.transaction.findUnique({
        where: { id: transactionId },
        select: {
          status: true,
          checkoutRequestId: true,
          orderId: true,
          amount: true,
          branchId: true,
          payerPhone: true,
          order: { select: { deliveryPhone: true, orderNumber: true } },
        },
      });
      if (!transaction || transaction.status !== "PENDING" || transaction.checkoutRequestId || !transaction.branchId) {
        return { httpStatus: 200, body: { ok: true, skipped: "not pending or already dispatched" } };
      }
      const branch = await db.branch.findUnique({ where: { id: transaction.branchId } });
      if (!branch) return { httpStatus: 200, body: { ok: true, skipped: "branch not found" } };

      const result = await runDispatch(branch, () =>
        dispatchStk({
          branch,
          // The number the payer typed for M-Pesa, NOT the order's contact
          // phone (older rows have no payerPhone — fall back to it).
          phone: transaction.payerPhone ?? transaction.order.deliveryPhone ?? "",
          amountCents: transaction.amount,
          orderId: transaction.orderId,
          orderNumber: transaction.order.orderNumber,
          kind: "online",
          kcbCallbackUrl: signedCallbackUrl(
            `${process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL}/api/payments/kcb/callback`,
            transactionId,
          ),
          darajaCallbackUrl: `${process.env.MPESA_CALLBACK_BASE_URL}/api/payments/mpesa/callback`,
        }),
      );

      await finalizeStkDispatch({ kind: "online", transactionId, orderId: transaction.orderId, result });
      console.info(
        `[dispatch-stk] online order=${transaction.orderId} result=${result.success ? `sent:${result.gatewayUsed}` : `failed:${result.reason}`}`,
      );
      return { httpStatus: 200, body: { ok: true } };
    }

    const transaction = await db.inStoreTransaction.findUnique({
      where: { id: transactionId },
      select: {
        status: true,
        checkoutRequestId: true,
        inStoreOrderId: true,
        amount: true,
        inStoreOrder: { select: { branchId: true, customerPhone: true, orderNumber: true } },
      },
    });
    if (!transaction || transaction.status !== "PENDING" || transaction.checkoutRequestId) {
      return { httpStatus: 200, body: { ok: true, skipped: "not pending or already dispatched" } };
    }
    const branch = await db.branch.findUnique({ where: { id: transaction.inStoreOrder.branchId } });
    if (!branch) return { httpStatus: 200, body: { ok: true, skipped: "branch not found" } };

    const instoreCallbackPath = "/api/payments/mpesa/instore-callback";
    const instoreCallbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}${instoreCallbackPath}`;
    // Same base the online KCB flow uses (see the online branch above).
    const instoreKcbCallbackUrl = signedCallbackUrl(
      `${process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL}${instoreCallbackPath}`,
      transactionId,
    );
    console.info(`[dispatch-stk] instore order=${transaction.inStoreOrderId} kcbCallbackUrl=${instoreKcbCallbackUrl}`);
    const result = await runDispatch(branch, () =>
      dispatchStk({
        branch,
        phone: transaction.inStoreOrder.customerPhone ?? "",
        amountCents: transaction.amount,
        orderId: transaction.inStoreOrderId,
        orderNumber: transaction.inStoreOrder.orderNumber,
        kind: "instore",
        kcbCallbackUrl: instoreKcbCallbackUrl,
        darajaCallbackUrl: instoreCallbackUrl,
      }),
    );

    await finalizeStkDispatch({ kind: "instore", transactionId, orderId: transaction.inStoreOrderId, result });
    console.info(
      `[dispatch-stk] instore order=${transaction.inStoreOrderId} result=${result.success ? `sent:${result.gatewayUsed}` : `failed:${result.reason}`}`,
    );
    return { httpStatus: 200, body: { ok: true } };
  } catch (e) {
    reportError(e, { route: "POST /api/admin/workers/dispatch-stk", tags: { stage: "handler" } });
    console.error("[dispatch-stk] unexpected error", e);
    return { httpStatus: 200, body: { ok: false, error: "internal" } };
  }
}

// A misconfigured gateway (assertGatewayEnv) is a deploy-time bug, not a
// per-request retry candidate — retrying would just resend the same useless
// request, so it's folded into a normal dispatch failure instead of thrown.
async function runDispatch(
  branch: Parameters<typeof dispatchStk>[0]["branch"],
  run: () => Promise<StkDispatchResult>,
): Promise<StkDispatchResult> {
  try {
    assertGatewayEnv();
  } catch (envErr) {
    reportError(envErr, { route: "POST /api/admin/workers/dispatch-stk", tags: { stage: "gateway_env" } });
    console.error("[dispatch-stk] assertGatewayEnv failed:", envErr);
    return {
      success: false,
      reason: (envErr as Error).message,
      gatewayAttempted: resolveMpesaGateway(branch),
    };
  }
  return run();
}
