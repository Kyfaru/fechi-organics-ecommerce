/**
 * POST /api/admin/workers/dispatch-stk
 *
 * QStash-triggered: actually sends the STK push, off the customer-facing
 * request path. Published by app/api/payments/mpesa/initiate,
 * app/api/payments/kcb/initiate and app/api/admin/orders/instore/mpesa/
 * initiate right after they create the order + PENDING transaction rows —
 * those routes respond to the browser before this ever runs, which is what
 * gets initiation under a second regardless of how long the gateway call
 * itself takes.
 *
 * Idempotency: a Redis NX claim is taken before anything else, so a QStash
 * redelivery (its own retry policy, or a slow-response timeout while a first
 * attempt is still mid-flight) can never trigger a second real STK push.
 * Returns 200 for every terminal outcome, success or business failure — a
 * non-2xx (and therefore a QStash retry) is reserved for the narrow case
 * where the claim itself couldn't be taken, i.e. nothing was attempted yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { verifyQstashRequest } from "@/lib/qstash";
import { assertGatewayEnv } from "@/lib/payments/gateway-env";
import { resolveMpesaGateway } from "@/lib/payments/mpesa/gateway";
import { dispatchStk, type StkDispatchResult } from "@/lib/payments/dispatch-stk";
import { finalizeStkDispatch } from "@/lib/payments/finalize-stk-dispatch";
import { reportError } from "@/lib/observability";

// Worst case is a full primary + fallback attempt, each up to 10s token +
// 15s STK push — matches the in-store route's old 60s cap, now spent here
// instead of on the customer-facing request.
export const maxDuration = 60;

type Job = { kind: "online" | "instore"; transactionId: string };

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { kind, transactionId } = JSON.parse(rawBody) as Job;

  let claimed: unknown;
  try {
    claimed = await getRedis().set(`stk_dispatch:${transactionId}`, "1", { nx: true, ex: 300 });
  } catch (redisErr) {
    // Nothing claimed, nothing dispatched — safe to let QStash retry.
    reportError(redisErr, { route: "POST /api/admin/workers/dispatch-stk", tags: { stage: "claim" } });
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }
  if (!claimed) {
    return NextResponse.json({ ok: true, skipped: "already claimed" });
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
          order: { select: { deliveryPhone: true, orderNumber: true } },
        },
      });
      if (!transaction || transaction.status !== "PENDING" || transaction.checkoutRequestId || !transaction.branchId) {
        return NextResponse.json({ ok: true, skipped: "not pending or already dispatched" });
      }
      const branch = await db.branch.findUnique({ where: { id: transaction.branchId } });
      if (!branch) return NextResponse.json({ ok: true, skipped: "branch not found" });

      const result = await runDispatch(branch, () =>
        dispatchStk({
          branch,
          phone: transaction.order.deliveryPhone ?? "",
          amountCents: transaction.amount,
          orderId: transaction.orderId,
          orderNumber: transaction.order.orderNumber,
          kind: "online",
          kcbCallbackUrl: `${process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL}/api/payments/kcb/callback`,
          darajaCallbackUrl: `${process.env.MPESA_CALLBACK_BASE_URL}/api/payments/mpesa/callback`,
        }),
      );

      await finalizeStkDispatch({ kind: "online", transactionId, orderId: transaction.orderId, result });
      console.info(
        `[dispatch-stk] online order=${transaction.orderId} result=${result.success ? `sent:${result.gatewayUsed}` : `failed:${result.reason}`}`,
      );
      return NextResponse.json({ ok: true });
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
      return NextResponse.json({ ok: true, skipped: "not pending or already dispatched" });
    }
    const branch = await db.branch.findUnique({ where: { id: transaction.inStoreOrder.branchId } });
    if (!branch) return NextResponse.json({ ok: true, skipped: "branch not found" });

    const instoreCallbackPath = "/api/payments/mpesa/instore-callback";
    const instoreCallbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}${instoreCallbackPath}`;
    // Same base the online KCB flow uses (see the online branch above).
    const instoreKcbCallbackUrl = `${process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL}${instoreCallbackPath}`;
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    reportError(e, { route: "POST /api/admin/workers/dispatch-stk", tags: { stage: "handler" } });
    console.error("[dispatch-stk] unexpected error", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 200 });
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
