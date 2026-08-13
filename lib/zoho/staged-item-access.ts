import { Err } from "@/lib/api";
import { isGlobalScope, type BranchCaller } from "@/lib/branch-access";
import { resolveZohoOrganizationId } from "@/lib/zoho/resolve-org";

/**
 * Row-level org check for the zohoStagedItem [id]/* actions (promote,
 * exclude, reenable). Unlike POST /api/admin/zoho/sync, the review-queue UI
 * calls these with a bare `fetch(url, { method: "POST" })` — no body — so
 * branch scoping can't use the sync route's "resolve org from
 * body.branchId" convention (see AdminZohoStagedItemsClient's mutations).
 *
 * Global-scope callers (lib/branch-access.ts — super admin, or HQ staff with
 * no branch assigned) already see every branch/org's data elsewhere in the
 * admin, so they're allowed through unchecked. A branch-scoped caller may
 * only act on staged items belonging to their own branch's Zoho
 * organization — resolved from their own branchId, never trusted from the
 * client.
 */
export async function assertStagedItemOrgAccess(
  caller: BranchCaller,
  stagedItemOrganizationId: string,
): Promise<Response | null> {
  if (isGlobalScope(caller)) return null;

  const callerOrgId = await resolveZohoOrganizationId(caller.branchId!);
  return callerOrgId === stagedItemOrganizationId ? null : Err.forbidden();
}
