"use client";

import type { ReactNode } from "react";
import { useCan } from "@/hooks/use-can";
import type { PermissionCheck } from "@/lib/require-permission";

/**
 * Conditionally renders children based on the signed-in admin's permissions.
 * UI-only — hides buttons/sections a role can't use. The real enforcement is
 * server-side (`requirePermission` on the API route); this just avoids
 * showing controls that would 403 if clicked.
 */
export function Can({
  permissions,
  children,
  fallback = null,
}: {
  permissions: PermissionCheck;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = useCan(permissions);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
