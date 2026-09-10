import { Err } from "@/lib/api";

/**
 * Row-level branch scoping on top of lib/require-permission.ts's pure
 * role/resource checks (which have no concept of "which branch"). "Global
 * scope" is derived from isSuperAdmin OR having no branch assigned at all —
 * not a hardcoded role-name list — so it never drifts out of sync with
 * lib/permissions.ts's role definitions and matches how HQ-tier vs.
 * branch-tier staff are actually seeded (HQ roles have branchId: null).
 */
export type BranchCaller = { branchId: string | null; isSuperAdmin: boolean };

export function isGlobalScope(caller: BranchCaller): boolean {
  return caller.isSuperAdmin || caller.branchId === null;
}

/** Prisma `where` fragment scoping a query to the caller's own branch, or {} for global-tier callers. */
export function buildBranchWhere(caller: BranchCaller): { branchId?: string } {
  return isGlobalScope(caller) ? {} : { branchId: caller.branchId! };
}

/** Returns a 403 Response if a branch-scoped caller targets a branch that isn't their own; null otherwise. */
export function assertBranchAccess(caller: BranchCaller, targetBranchId: string): Response | null {
  if (isGlobalScope(caller)) return null;
  return caller.branchId === targetBranchId ? null : Err.forbidden();
}
