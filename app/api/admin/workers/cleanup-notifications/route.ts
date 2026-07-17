/**
 * GET /api/admin/workers/cleanup-notifications
 *
 * Triggered daily by Vercel Cron (vercel.json). Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` on cron-triggered requests once
 * CRON_SECRET is set — verified below so this can't be hit by anyone else.
 *
 * Retention rule (design doc Section 14 addendum): delete notifications
 * older than 45 days that aren't CRITICAL and have actually been read —
 * i.e. at least one recipient read it, and nobody who has a recorded state
 * for it still has it unread. A notification nobody has ever opened is left
 * alone rather than silently vanishing.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const RETENTION_DAYS = 45;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const { count } = await db.notification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      severity: { not: "CRITICAL" },
      recipientStates: {
        some: { readAt: { not: null } },
        none: { readAt: null },
      },
    },
  });

  console.info("[cleanup-notifications] deleted", count, "notifications older than", cutoff.toISOString());
  return NextResponse.json({ ok: true, deleted: count });
}
