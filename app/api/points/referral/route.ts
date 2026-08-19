/**
 * POST /api/points/referral  — claim a referral code
 * GET  /api/points/referral  — the caller's own code and how many uses remain
 *
 * Better Auth's user-create hook never sees the request body, so the signup UI
 * posts the code here immediately after the account is created. Idempotent and
 * safe to retry: one referrer per person forever, and a customer who has
 * already paid for an order can never retroactively claim to have been
 * referred.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { attachReferral, grantJoiningBonus } from "@/lib/points/referrals";
import { ensureLoyaltyAccount } from "@/lib/points/ledger";
import { MAX_REWARDED_REFERRALS, REFERRED_BONUS_POINTS } from "@/lib/points/rules";
import { reportError } from "@/lib/observability";

const REASONS: Record<string, string> = {
  UNKNOWN_CODE: "That referral code doesn't exist",
  SELF_REFERRAL: "You can't refer yourself",
  ALREADY_REFERRED: "You've already used a referral code",
  CAP_REACHED: "That code has reached its limit of five referrals",
  NOT_NEW: "Referral codes are for first-time customers only",
};

const bodySchema = z.object({ code: z.string().min(3).max(32) }).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Err.validation("A referral code is required");

    // Re-grants the joining bonus if the signup hook's best-effort call failed.
    // Idempotent through the ledger's unique constraint.
    await grantJoiningBonus({ userId: session.user.id });

    const result = await attachReferral({ userId: session.user.id, code: parsed.data.code });

    if (!result.attached) {
      return ok({ attached: false, reason: result.reason, message: REASONS[result.reason] });
    }

    return ok({
      attached: true,
      bonusPoints: result.bonusPoints,
      message: `${REFERRED_BONUS_POINTS.toLocaleString()} bonus points added — they unlock with your first order`,
    });
  } catch (e) {
    reportError(e, { route: "POST /api/points/referral", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}

export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const loyalty = await ensureLoyaltyAccount(session.user.id);
    const referrals = await db.referral.findMany({
      where: { referrerUserId: session.user.id },
      select: { convertedAt: true, rewardedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const rewarded = referrals.filter((r) => r.rewardedAt).length;

    return ok({
      referralCode: loyalty.referralCode,
      userCode: loyalty.userCode,
      maxReferrals: MAX_REWARDED_REFERRALS,
      rewarded,
      remaining: Math.max(0, MAX_REWARDED_REFERRALS - rewarded),
      pending: referrals.filter((r) => !r.convertedAt).length,
    });
  } catch (e) {
    reportError(e, { route: "GET /api/points/referral", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
