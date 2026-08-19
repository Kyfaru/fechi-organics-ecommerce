/**
 * POST /api/admin/loyalty/grants/[id] — cast an approve/reject vote.
 *
 * The grant releases only once every currently-active super admin has
 * approved. One rejection kills it.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { loadCallerContext } from "@/lib/require-permission";
import { voteOnGrant, GrantError } from "@/lib/points/grants";
import { reportError } from "@/lib/observability";

const bodySchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }).strict();

export async function POST(req: NextRequest, ctxParam: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const ctx = await loadCallerContext();
    if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
    if (!ctx.isSuperAdmin) return Err.forbidden();

    const { id } = await ctxParam.params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Err.validation("decision must be APPROVED or REJECTED");

    const outcome = await voteOnGrant({
      requestId: id,
      adminProfileId: ctx.id,
      decision: parsed.data.decision,
    });
    return ok(outcome);
  } catch (e) {
    if (e instanceof GrantError) return Err.validation(e.message);
    reportError(e, { route: "POST /api/admin/loyalty/grants/[id]", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
