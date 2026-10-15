"use client";

/**
 * Optimistic admin logout: wipes client state and routes to the login page
 * immediately, then invalidates the server session in the background.
 *
 * The session cookie is httpOnly, so only the server's Set-Cookie on
 * sign-out can clear it — that happens when the background call returns.
 * A pending flag survives a failed/interrupted call and is retried the next
 * time the login page mounts (retryPendingLogout).
 */

import { authClient } from "@/lib/auth-client";
import { clearPersistedQueryCache } from "@/app/providers";
import { useSessionStore } from "@/lib/stores/session-store";

const PENDING_KEY = "admin-pending-logout";

let pendingLogout: Promise<void> = Promise.resolve();
let inFlight = false;

/** Resolves once any in-flight background logout has finished. */
export function awaitPendingLogout(): Promise<void> {
  return pendingLogout;
}

function flag(on: boolean) {
  try {
    if (on) localStorage.setItem(PENDING_KEY, "1");
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked — best-effort only.
  }
}

function invalidateSession(ping: boolean): Promise<void> {
  inFlight = true;
  flag(true); // set up front so a closed tab mid-flight is retried later
  // Ping must precede signOut: it needs the live session to stamp lastLogoutAt.
  const start = ping
    ? fetch("/api/admin/logout-ping", { method: "POST", keepalive: true }).catch(() => {})
    : Promise.resolve();
  pendingLogout = start
    .then(() => authClient.signOut({ fetchOptions: { keepalive: true } }))
    .then((res) => {
      if (res?.error) throw new Error(res.error.message ?? "sign-out failed");
      flag(false);
    })
    .catch(() => {
      // Leave the flag set — retried on the next /admin/login mount.
    })
    .finally(() => {
      inFlight = false;
    });
  return pendingLogout;
}

export function adminLogout(router: { replace: (href: string) => void }): void {
  // 1. Instant client wipe — no stale dashboard data survives the transition.
  clearPersistedQueryCache();
  useSessionStore.getState().clearSession();
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  // 2. Instant routing — replace so Back can't return to the dashboard.
  router.replace("/admin/login");
  // 3. Background invalidation — never awaited by the UI.
  void invalidateSession(true);
}

/**
 * True while a logout is mid-flight or unfinished. The login page's
 * "already signed in → /admin" effect must skip then: useSession() still
 * holds the old session until the background sign-out lands.
 */
export function isLogoutPending(): boolean {
  if (inFlight) return true;
  try {
    return localStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

/** Call on /admin/login mount: finishes a logout that never completed. */
export function retryPendingLogout(): void {
  if (inFlight) return;
  try {
    if (localStorage.getItem(PENDING_KEY) !== "1") return;
  } catch {
    return;
  }
  void invalidateSession(false);
}
