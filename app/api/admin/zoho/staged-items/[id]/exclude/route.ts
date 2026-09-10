import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertStagedItemOrgAccess } from "@/lib/zoho/staged-item-access";
import { reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// POST /api/admin/zoho/staged-items/[id]/exclude
// Permanently drops a staged item from the review queue — syncItemToProduct
// checks this status and skips re-staging an EXCLUDED item on every future
// sync, so this is a sticky decision until an admin explicitly re-enables it.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { products: ["delete"] });
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
      data: { status: "EXCLUDED", excludedAt: new Date(), excludedByUserId: caller.id },
      select: { id: true, status: true, excludedAt: true },
    });

    console.info("[admin/zoho/staged-items/exclude] Excluded staged item", id);
    return ok(updated);
  } catch (e) {
    console.error("[admin/zoho/staged-items/exclude] POST error", e);
    reportError(e, { route: "POST /api/admin/zoho/staged-items/[id]/exclude", userId: caller.id });
    return Err.internal();
  }
}
