/**
 * GET /api/admin/workers/verify-points
 *
 * Nightly Vercel Cron (vercel.json). Re-walks every customer's points chain
 * and re-derives every hash and running total.
 *
 * The HMAC chain in lib/points/ledger.ts is what makes tampering *detectable*;
 * this is the thing that does the detecting. The database trigger in
 * prisma/sql/points-ledger-guard.sql blocks ordinary UPDATE/DELETE, but a
 * superuser can disable a trigger — the chain cannot be forged without
 * POINTS_LEDGER_SECRET, which lives in the environment and not the database.
 *
 * A break raises a CRITICAL notification rather than repairing anything.
 * Silently "fixing" a balance would destroy the evidence of what happened.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyChain } from "@/lib/points/ledger";
import { createNotification } from "@/lib/notify";
import { reportError } from "@/lib/observability";

/** Reported in the alert; the full list is in the response body and logs. */
const MAX_LISTED = 10;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await db.loyaltyPoints.findMany({
      select: { userId: true },
      orderBy: { createdAt: "asc" },
    });

    const broken: Array<{ userId: string; reason?: string; brokenAtSeq?: number }> = [];
    let entries = 0;

    for (const { userId } of accounts) {
      const result = await verifyChain(userId);
      entries += result.entries;
      if (!result.ok) {
        broken.push({ userId, reason: result.reason, brokenAtSeq: result.brokenAtSeq });
        console.error(
          `[verify-points] BROKEN ${userId} — ${result.reason}` +
            (result.brokenAtSeq ? ` at seq ${result.brokenAtSeq}` : ""),
        );
      }
    }

    if (broken.length > 0) {
      const listed = broken
        .slice(0, MAX_LISTED)
        .map((b) => `${b.userId} (${b.reason})`)
        .join(", ");
      await createNotification({
        type: "LOYALTY_LEDGER_BREACH",
        severity: "CRITICAL",
        title: `Points ledger integrity failure on ${broken.length} account${broken.length === 1 ? "" : "s"}`,
        body:
          `The nightly verification could not reconcile ${broken.length} of ${accounts.length} points chains. ` +
          `Do not adjust balances — investigate first. Affected: ${listed}` +
          (broken.length > MAX_LISTED ? ` and ${broken.length - MAX_LISTED} more.` : "."),
        link: "/admin/loyalty",
        branchId: null,
      }).catch((e) => console.error("[verify-points] alert failed", e));

      // Surface it in Sentry too — a cron alert nobody is looking at is not an alert.
      reportError(new Error(`Points ledger integrity failure on ${broken.length} account(s)`), {
        route: "GET /api/admin/workers/verify-points",
        tags: { domain: "loyalty" },
        extra: { broken: broken.slice(0, MAX_LISTED) },
      });
    }

    return NextResponse.json({
      ok: broken.length === 0,
      accounts: accounts.length,
      entries,
      broken,
    });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/workers/verify-points", tags: { domain: "loyalty" } });
    console.error("[verify-points] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
