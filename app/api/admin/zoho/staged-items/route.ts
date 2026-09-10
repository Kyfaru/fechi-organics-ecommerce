import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { resolveZohoOrganizationId } from "@/lib/zoho/resolve-org";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertBranchAccess } from "@/lib/branch-access";
import { reportError } from "@/lib/observability";
import type { ZohoStagedItemStatus } from "@prisma/client";

const VALID_STATUSES: ZohoStagedItemStatus[] = ["PENDING", "EXCLUDED"];

// ---------------------------------------------------------------------------
// GET /api/admin/zoho/staged-items?branchId=...&status=PENDING|EXCLUDED
// Lists Zoho items awaiting review (or already excluded) for the org linked
// to branchId. status defaults to PENDING — see AdminZohoStagedItemsClient,
// which drives both the review queue and the "Expelled" page off this route.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { products: ["view"] });
  if (denied) return denied;

  const branchId = req.nextUrl.searchParams.get("branchId");
  if (!branchId) return Err.validation("branchId is required");

  const statusParam = req.nextUrl.searchParams.get("status") ?? "PENDING";
  if (!VALID_STATUSES.includes(statusParam as ZohoStagedItemStatus)) {
    return Err.validation("status must be PENDING or EXCLUDED");
  }
  const status = statusParam as ZohoStagedItemStatus;

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();

  const forbidden = assertBranchAccess(caller, branchId);
  if (forbidden) return forbidden;

  const organizationId = await resolveZohoOrganizationId(branchId);
  if (!organizationId) return Err.validation("This branch isn't linked to a Zoho organization yet");

  try {
    const items = await db.zohoStagedItem.findMany({
      where: { organizationId, status },
      // rawPayload omitted — the review UI only needs the flattened fields,
      // and there's no reason to ship the full Zoho response to the client.
      select: {
        id: true,
        organizationId: true,
        zohoItemId: true,
        status: true,
        name: true,
        description: true,
        sku: true,
        productType: true,
        zohoStatus: true,
        unit: true,
        brand: true,
        rateKes: true,
        purchaseRateKes: true,
        categoryNameRaw: true,
        stockOnHand: true,
        firstSeenAt: true,
        lastSeenAt: true,
        excludedAt: true,
        excludedByUserId: true,
        reenabledAt: true,
        reenabledByUserId: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });

    return ok({ items });
  } catch (e) {
    console.error("[admin/zoho/staged-items] GET error", e);
    reportError(e, { route: "GET /api/admin/zoho/staged-items", userId: caller.id, extra: { organizationId, branchId, status } });
    return Err.internal();
  }
}
