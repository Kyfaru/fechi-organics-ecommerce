import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertStagedItemOrgAccess } from "@/lib/zoho/staged-item-access";
import { reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// POST /api/admin/zoho/staged-items/[id]/reenable
// Moves an EXCLUDED item back to PENDING so it re-appears in the review
// queue. excludedAt/excludedByUserId are kept as history (not cleared) —
// only reenabledAt/reenabledByUserId record this action.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { products: ["update"] });
  if (denied) return denied;

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();

  try {
    const { id } = await params;

    const staged = await db.zohoStagedItem.findUnique({ where: { id }, select: { organizationId: true } });
    if (!staged) return Err.notFound("Staged item");

    const forbidden = await assertStagedItemOrgAccess(caller, staged.organizationId);
    if (forbidden) return forbidden;

    const updated = await db.zohoStagedItem.update({
      where: { id },
      data: { status: "PENDING", reenabledAt: new Date(), reenabledByUserId: caller.id },
      select: { id: true, status: true, reenabledAt: true },
    });

    console.info("[admin/zoho/staged-items/reenable] Re-enabled staged item", id);
    return ok(updated);
  } catch (e) {
    console.error("[admin/zoho/staged-items/reenable] POST error", e);
    reportError(e, { route: "POST /api/admin/zoho/staged-items/[id]/reenable", userId: caller.id });
    return Err.internal();
  }
}
