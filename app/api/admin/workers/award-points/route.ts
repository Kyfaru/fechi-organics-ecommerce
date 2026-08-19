/**
 * POST /api/admin/workers/award-points
 *
 * Enqueued by markPaymentSuccess() (and its in-store twin) the moment an order
 * is confirmed paid. Awards order points, streaks and VIP perks, unlocks the
 * signup bonus, converts a pending referral, evaluates badges, and tells the
 * customer what they earned.
 *
 * Every step is idempotent through the ledger's unique constraint, so a
 * replayed QStash delivery is harmless.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { awardPointsForOrder } from "@/lib/points/award-order";
import { unlockJoiningBonus } from "@/lib/points/anti-abuse";
import { convertReferral, attachReferral } from "@/lib/points/referrals";
import { looksLikeReferralCode } from "@/lib/points/referral-discount";
import { evaluateBadges } from "@/lib/points/evaluate-badges";
import { getUserStats } from "@/lib/points/stats";
import { getBalance } from "@/lib/points/ledger";
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

    // Order matters: the signup bonus and the referral reward both hinge on
    // this being the customer's first paid order, so they run before badges
    // (which count points earned) and before the summary message.
    const unlock = await unlockJoiningBonus({ userId, orderId, refType });

    // A referral code entered in the coupon box is only linked once the order
    // it discounted is actually paid — a code typed into an abandoned checkout
    // must not burn anybody's referral slot. No-ops if already linked.
    const promoCode =
      refType === "order"
        ? (await db.order.findUnique({ where: { id: orderId }, select: { promoCode: true } }))?.promoCode
        : (await db.inStoreOrder.findUnique({ where: { id: orderId }, select: { promoCode: true } }))
            ?.promoCode;

    if (promoCode && looksLikeReferralCode(promoCode)) {
      await attachReferral({ userId, code: promoCode, ignoreOrderId: orderId });
    }

    const referral = await convertReferral({ userId, orderId });

    const stats = await getUserStats(userId);
    const unlocked = await evaluateBadges(stats);

    const badgePoints = unlocked.reduce((s, b) => s + b.points, 0);
    const totalThisOrder =
      summary.totalPoints + badgePoints + (unlock.unlockedPoints ?? 0) + (referral.referredPoints ?? 0);

    const balance = await getBalance(userId);

    // --- tell the customer -------------------------------------------------
    const lines = [`You earned ${summary.totalPoints.toLocaleString()} points on this order.`];
    if (summary.tierLabel) lines.push(`${summary.tierLabel} bonus included.`);
    if (summary.streakPoints > 0) lines.push(`Streak bonus: ${summary.streakPoints.toLocaleString()} points.`);
    if (unlock.unlockedPoints) lines.push(`Your ${unlock.unlockedPoints.toLocaleString()} welcome points are now unlocked.`);
    if (badgePoints > 0) lines.push(`${unlocked.length} new achievement${unlocked.length === 1 ? "" : "s"} unlocked.`);
    if (summary.vipCouponCode) lines.push(`VIP reward unlocked — use code ${summary.vipCouponCode} on your next orders.`);
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
      data: { ...summary, badgesUnlocked: unlocked.length, badgePoints, balance: balance.available },
    });
  } catch (e) {
    reportError(e, { route: "POST /api/admin/workers/award-points", tags: { domain: "loyalty" } });
    console.error("[award-points] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
