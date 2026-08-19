/**
 * GET   /api/admin/loyalty/flags — accounts scored as likely duplicate signups
 * PATCH /api/admin/loyalty/flags — mark one reviewed
 *
 * Reviewing a flag records who looked at it and when. It deliberately does NOT
 * restore a voided bonus: points only ever move through the ledger, so putting
 * a bonus back is a super-admin grant, on the record, with unanimous approval.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const denied = await requirePermission(req, { loyalty: ["view"] });
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const showReviewed = searchParams.get("reviewed") === "true";

    const flags = await db.pointsAbuseFlag.findMany({
      where: showReviewed ? {} : { reviewedAt: null },
      orderBy: [{ reviewedAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    const users = await db.user.findMany({
      where: { id: { in: [...new Set(flags.map((f) => f.userId))] } },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return ok({
      flags: flags.map((f) => ({
        id: f.id,
        userId: f.userId,
        customer: byId.get(f.userId) ?? null,
        score: f.score,
        reasons: f.reasons,
        action: f.action,
        reviewedAt: f.reviewedAt,
        createdAt: f.createdAt,
      })),
    });
  } catch (e) {
    reportError(e, { route: "GET /api/admin/loyalty/flags", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}

const patchSchema = z.object({ id: z.string().min(1) }).strict();

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { loyalty: ["update"] });
    if (denied) return denied;

    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Err.validation("A flag id is required");

    await db.pointsAbuseFlag.update({
      where: { id: parsed.data.id },
      data: { reviewedAt: new Date(), reviewedByAdminProfileId: ctx.id },
    });

    return ok({ reviewed: true });
  } catch (e) {
    reportError(e, { route: "PATCH /api/admin/loyalty/flags", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
