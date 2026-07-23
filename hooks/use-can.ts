"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import type { PermissionCheck } from "@/lib/require-permission";

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

/**
 * UI-only permission check — hides/shows nav items and action buttons.
 * NOT the security boundary; the real check is `requirePermission` on the
 * server. Returns false while the profile is still loading.
 */
export function useCan(permissions: PermissionCheck): boolean {
  const { data: me } = useAdminMe();
  if (!me?.role) return false;
  if (me.isSuperAdmin) return true;
  const deny: string[] = me.permissions?.deny ?? [];
  if (Object.keys(permissions).some((resource) => deny.includes(resource))) return false;
  return authClient.admin.checkRolePermission({
    role: me.role,
    permissions,
  });
}
