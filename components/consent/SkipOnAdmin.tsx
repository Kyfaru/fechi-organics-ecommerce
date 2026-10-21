"use client";

import { usePathname } from "next/navigation";

/** Keeps analytics/tag scripts off the admin panel. */
export function SkipOnAdmin({ children }: { children: React.ReactNode }) {
  return usePathname().startsWith("/admin") ? null : <>{children}</>;
}
