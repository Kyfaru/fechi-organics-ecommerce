import { NextRequest } from "next/server";
import { connection } from "next/server";
import { getRedis } from "@/lib/redis";
import { ok, Err } from "@/lib/api";
import { syncAllItems } from "@/lib/zoho-sync";
import { resolveZohoOrganizationId } from "@/lib/zoho/resolve-org";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertBranchAccess } from "@/lib/branch-access";

// ---------------------------------------------------------------------------
// POST /api/admin/zoho/sync  — RBAC-gated, rate-limited to 1 call per 60s per
// organization. Several branches can share one org, so the rate limit and
// the sync itself are keyed by organizationId — triggering sync from two
// sibling branches within 60s still only runs (and is limited to) one sync.
// Body: { branchId: string } — the branch just selects which org to sync.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { inventory: ["adjust"] });
  if (denied) return denied;

  let body: { branchId?: string };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  const { branchId } = body;
  if (!branchId) return Err.validation("branchId is required");

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();

  const forbidden = assertBranchAccess(caller, branchId);
  if (forbidden) return forbidden;

  const organizationId = await resolveZohoOrganizationId(branchId);
  if (!organizationId) return Err.validation("This branch isn't linked to a Zoho organization yet");

  try {
    // Rate limit: max 1 sync per organization per 60 seconds.
    const redis = getRedis();
    const rateLimitKey = `zoho:sync:ratelimit:${organizationId}`;
    const count = await redis.incr(rateLimitKey);
    if (count === 1) {
      await redis.expire(rateLimitKey, 60);
    }
    if (count > 1) {
      return Err.rateLimited();
    }

    console.info("[admin/zoho/sync] Starting full item sync for organization", organizationId);
    const result = await syncAllItems(organizationId);
    console.info("[admin/zoho/sync] Sync complete for organization", organizationId, result);

    return ok(result);
  } catch (e) {
    console.error("[admin/zoho/sync] POST error", e);
    return Err.internal(e);
  }
}
