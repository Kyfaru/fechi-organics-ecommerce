"use client";

import { useEffect } from "react";
import { clearPersistedQueryCache } from "@/app/providers";

/**
 * Clears all client-side admin storage the moment the admin panel is
 * actually left — closing the tab, closing the browser, or a hard
 * navigation away (typing a new URL, closing the window). This does NOT
 * fire on normal in-app <Link> navigation between admin pages, since that's
 * client-side routing, not a page unload.
 *
 * The httpOnly session cookie itself is handled separately (see the
 * `rememberMe: false` sign-in call in app/admin/login/page.tsx) — the
 * browser drops that on its own when it closes; JS can't touch an httpOnly
 * cookie either way. This component's job is everything JS *can* reach:
 * localStorage and sessionStorage.
 */
export function AdminSessionGuard() {
  useEffect(() => {
    function clearAdminStorage() {
      clearPersistedQueryCache();
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // Storage can throw in locked-down/private-browsing contexts — not
        // worth surfacing, the cookie itself is still the real guard.
      }
    }
    window.addEventListener("pagehide", clearAdminStorage);
    return () => window.removeEventListener("pagehide", clearAdminStorage);
  }, []);

  return null;
}
