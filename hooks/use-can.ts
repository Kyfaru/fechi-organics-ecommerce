"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import type { PermissionCheck } from "@/lib/require-permission";
import type { RoleName } from "@/lib/permissions";

/**
 * Fetches the signed-in admin's profile (role, permissions, etc.) from
 * /api/admin/me. Shared query key ("admin-me") so every consumer (sidebar,
 * useCan, page headers) hits one cached fetch.
 */
export function useAdminMe() {
  return useQuery({
    queryKey: ["admin-me"],
    queryFn: () => fetch("/api/admin/me").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

/** Shape of the cached /api/admin/me response consumed by permission checks. */
type AdminMe = { role?: string; isSuperAdmin?: boolean; permissions?: { deny?: string[] } } | undefined;

/**
 * UI-only permission check, factored out so it can be called directly (not
 * just as a hook) — e.g. filtering a list of resources without violating
 * the rules of hooks. NOT the security boundary; the real check is
 * `requirePermission` on the server.
 */
export function checkPermission(me: AdminMe, permissions: PermissionCheck): boolean {
  if (!me?.role) return false;
  if (me.isSuperAdmin) return true;
  const deny: string[] = me.permissions?.deny ?? [];
  if (Object.keys(permissions).some((resource) => deny.includes(resource))) return false;
  return authClient.admin.checkRolePermission({
    role: me.role as RoleName,
    permissions,
  });
}

/**
 * UI-only permission check — hides/shows nav items and action buttons.
 * NOT the security boundary; the real check is `requirePermission` on the
 * server. Returns false while the profile is still loading.
 */
export function useCan(permissions: PermissionCheck): boolean {
  const { data: me } = useAdminMe();
  return checkPermission(me, permissions);
}
