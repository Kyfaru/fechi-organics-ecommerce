/**
 * Holding and releasing points spent at checkout.
 *
 * Points are debited when the order is created, not when payment confirms, so
 * the same balance cannot be spent in two parallel checkouts. If the payment
 * then fails, times out or is cancelled, a compensating entry gives them back.
 *
 * ponytail: no reservation table and no TTL sweeper. The ledger is append-only
 * anyway, so a compensating entry is both the cheapest mechanism and the one
 * that leaves the clearest audit trail. markPaymentFailed() already runs on
 * every failure path, including the timeout DELETE in
 * app/api/payments/status/[orderId], so there is nowhere left to leak.
 */

import { db } from "@/lib/db";
import { awardPoints } from "@/lib/points/ledger";
import type { TxClient } from "@/lib/orders/generate-order-number";

export type RedeemRefType = "order" | "inStoreOrder";

/** Debits points against an order being created. No-op for a zero redemption. */
export async function holdRedeemedPoints(args: {
  userId: string;
  orderId: string;
  points: number;
  refType?: RedeemRefType;
  tx?: TxClient;
}): Promise<void> {
  if (args.points <= 0) return;
  await awardPoints({
    userId: args.userId,
    delta: -args.points,
    reason: "REDEEM",
    refType: args.refType ?? "order",
    refId: args.orderId,
    tx: args.tx,
  });
}

/**
 * Returns points held against an order that will never be paid. Idempotent —
 * a second call hits the ledger's unique constraint and no-ops, so it is safe
 * on a failure path that can fire more than once (callback plus timeout job).
 */
export async function releaseRedeemedPoints(args: {
  orderId: string;
  refType?: RedeemRefType;
}): Promise<void> {
  const refType = args.refType ?? "order";

  const order =
    refType === "order"
      ? await db.order.findUnique({
          where: { id: args.orderId },
          select: { userId: true, pointsRedeemed: true },
        })
      : await db.inStoreOrder
          .findUnique({
            where: { id: args.orderId },
            select: { customerUserId: true, pointsRedeemed: true },
          })
          .then((o) => (o ? { userId: o.customerUserId, pointsRedeemed: o.pointsRedeemed } : null));

  if (!order?.userId || order.pointsRedeemed <= 0) return;

  await awardPoints({
    userId: order.userId,
    delta: order.pointsRedeemed,
    reason: "REDEEM_REVERSED",
    refType,
    refId: args.orderId,
  });
}

/**
 * Reverses both directions for a refunded or cancelled order that WAS paid:
 * hands back the points spent on it and claws back the points it earned.
 */
export async function reversePointsForRefund(args: {
  orderId: string;
  refType?: RedeemRefType;
}): Promise<void> {
  const refType = args.refType ?? "order";
  await releaseRedeemedPoints(args);

  const earned = await db.pointsLedger.aggregate({
    where: {
      refType,
      refId: args.orderId,
      reason: { in: ["ORDER_BASE", "ORDER_VALUE_TIER", "STREAK_4W", "STREAK_6M_WEEKLY", "STREAK_6M_MONTHLY"] },
    },
    _sum: { delta: true },
  });

  const total = earned._sum.delta ?? 0;
  if (total <= 0) return;

  const owner = await db.pointsLedger.findFirst({
    where: { refType, refId: args.orderId },
    select: { userId: true },
  });
  if (!owner) return;

  await awardPoints({
    userId: owner.userId,
    delta: -total,
    reason: "ORDER_REFUND_CLAWBACK",
    refType,
    refId: args.orderId,
  });
}
