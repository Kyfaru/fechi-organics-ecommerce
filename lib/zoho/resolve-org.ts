import { db } from "@/lib/db";

/**
 * Looks up which Zoho organization a branch is linked to. Returns null
 * (never throws) when the branch hasn't been linked yet — callers should
 * skip-and-log, matching the existing convention that Zoho is always
 * best-effort and must never block a user-facing flow.
 */
export async function resolveZohoOrganizationId(branchId: string): Promise<string | null> {
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { zohoOrganizationId: true },
  });
  return branch?.zohoOrganizationId ?? null;
}
