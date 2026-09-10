/**
 * POST /api/admin/workers/award-points
 *
 * Enqueued by markPaymentSuccess() (and its in-store twin) the moment an order
 * is confirmed paid. Awards order points, resolves the joining/referral bonus,
 * and tells the customer what they earned.
 *
 * Every step is idempotent through the ledger's unique constraint, so a
 * replayed QStash delivery is harmless.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { awardPointsForOrder } from "@/lib/points/award-order";
import { processReferralActivation, attachReferral, referralOwnerForCode } from "@/lib/points/referrals";
import { getBalance, awardPoints } from "@/lib/points/ledger";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { reportError } from "@/lib/observability";

type Body = { orderId: string; refType?: "order" | "inStoreOrder" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const sig = req.headers.get("upstash-signature");
    if (!(await verifyQstashRequest(sig, body))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const { orderId, refType = "order" } = JSON.parse(body) as Body;

    const summary = await awardPointsForOrder({ orderId, refType });
    if (!summary) return NextResponse.json({ ok: true, skipped: "no eligible customer" });

    const { userId } = summary;

    // A referral code entered in the coupon box is only linked once the order
    // it discounted is actually paid — a code typed into an abandoned checkout
    // must not burn anybody's referral slot. No-ops if already linked.
    const promoCode =
      refType === "order"
        ? (await db.order.findUnique({ where: { id: orderId }, select: { promoCode: true } }))?.promoCode
        : (await db.inStoreOrder.findUnique({ where: { id: orderId }, select: { promoCode: true } }))
            ?.promoCode;

    if (promoCode && (await referralOwnerForCode(promoCode))) {
      await attachReferral({ userId, code: promoCode, ignoreOrderId: orderId });
    }

    // A coupon may carry points of its own. Credited here, not at checkout, so
    // an abandoned order never pays out. The ledger's unique key on
    // (userId, reason, refType, refId) makes a replayed job a no-op.
    let couponPoints = 0;
    if (promoCode) {
      const coupon = await db.promotion.findUnique({
        where: { code: promoCode },
        select: { id: true, pointsAward: true, approvalStatus: true },
      });
      if (coupon && coupon.pointsAward > 0 && coupon.approvalStatus === "APPROVED") {
        const entry = await awardPoints({
          userId,
          delta: coupon.pointsAward,
          reason: "COUPON_BONUS",
          refType: "coupon",
          refId: coupon.id,
          meta: { orderId, code: promoCode },
        });
        if (entry) couponPoints = coupon.pointsAward;
      }
    }

    const activation = await processReferralActivation({ userId, orderId, refType });

    const totalThisOrder = summary.points + couponPoints + activation.selfUnlockedPoints;

    const balance = await getBalance(userId);

    // --- tell the customer -------------------------------------------------
    const lines = [`You earned ${summary.points.toLocaleString()} points on this order.`];
    if (activation.selfUnlockedPoints) {
      lines.push(`Your ${activation.selfUnlockedPoints.toLocaleString()} welcome points are now unlocked.`);
    }
    if (couponPoints > 0) lines.push(`Coupon bonus: ${couponPoints.toLocaleString()} points.`);
    lines.push(`Balance: ${balance.available.toLocaleString()} points.`);

    await db.inboxMessage.create({
      data: {
        userId,
        type: "SYSTEM",
        title: `You earned ${totalThisOrder.toLocaleString()} Fechi points`,
        body: lines.join(" "),
        orderId: refType === "order" ? orderId : null,
      },
    });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { phone: true, phoneCode: true },
    });
    const phone = user?.phone ? combineLegacyPhone(user.phone, user.phoneCode) : null;
    if (hasSmsConfig() && phone && totalThisOrder > 0) {
      await sendSms(
        phone,
        `Fechi Organics: you earned ${totalThisOrder.toLocaleString()} points. Balance ${balance.available.toLocaleString()}. See ${process.env.NEXT_PUBLIC_APP_URL}/account/achievements`,
      ).catch((e) => console.error("[award-points] SMS failed:", e));
    }

    return NextResponse.json({
      ok: true,
      data: { ...summary, balance: balance.available },
    });
  } catch (e) {
    reportError(e, { route: "POST /api/admin/workers/award-points", tags: { domain: "loyalty" } });
    console.error("[award-points] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
