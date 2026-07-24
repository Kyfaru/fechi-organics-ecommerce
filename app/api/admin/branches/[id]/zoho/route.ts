import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertBranchAccess } from "@/lib/branch-access";
import { assertTrustedOrigin } from "@/lib/origin-check";

// Both fields optional so a partial update (e.g. only setting the warehouse
// id after the org link is already made) doesn't require resending both.
// zohoOrganizationId: "" explicitly unlinks the branch from its org.
const PatchSchema = z.object({
  zohoOrganizationId: z.string().optional(),
  zohoWarehouseId: z.string().optional(),
}).strict();

/**
 * PATCH /api/admin/branches/[id]/zoho — link (or unlink) a branch to an
 * already-configured Zoho organization, and optionally set which Zoho
 * warehouse/location represents this branch's physical stock within that
 * org's catalog. Gated by branches:update plus branch ownership: admin/
 * super_admin may edit any branch, a branch-scoped manager only their own
 * (lib/branch-access.ts — requirePermission has no row-level concept).
 *
 * This route no longer owns raw Zoho credentials — those live on
 * zohoOrganization, managed via /api/admin/zoho/organizations (HQ-only).
 * A branch manager may point their branch at an org HQ already set up,
 * without ever seeing that org's secrets.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { branches: ["update"] });
  if (denied) return denied;

  const { id: branchId } = await params;

  const ctx = await loadCallerContext();
  if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
  const forbidden = assertBranchAccess(ctx, branchId);
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
  const { zohoOrganizationId, zohoWarehouseId } = parsed.data;

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) return Err.notFound("Branch");

    if (zohoOrganizationId !== undefined && zohoOrganizationId !== "") {
      const org = await db.zohoOrganization.findUnique({ where: { id: zohoOrganizationId }, select: { id: true } });
      if (!org) return Err.validation("Zoho organization not found");
    }

    const data: { zohoOrganizationId?: string | null; zohoWarehouseId?: string | null } = {};
    if (zohoOrganizationId !== undefined) data.zohoOrganizationId = zohoOrganizationId || null;
    if (zohoWarehouseId !== undefined) data.zohoWarehouseId = zohoWarehouseId || null;

    if (Object.keys(data).length > 0) {
      await db.branch.update({ where: { id: branchId }, data });
    }

    return ok({ saved: true });
  } catch (e) {
    console.error("[admin/branches/[id]/zoho] PATCH error", e);
    return Err.internal(e);
  }
}
