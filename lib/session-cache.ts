"use client";

/**
 * Instant-paint cache for the Navbar's profile display.
 *
 * Better Auth's useSession() always does a live round-trip on mount (cookie
 * validation against the DB), so a returning user sees the navbar flash a
 * logged-out "Log in" button before flipping to their profile once the
 * session resolves. This cache stores only the display fields that are
 * already visible in the rendered UI — name, avatar image, role — so the
 * Navbar can paint the profile instantly from the last-known-good values
 * while useSession() re-validates in the background.
 *
 * Security boundary: this cache NEVER stores the session token, cookie value,
 * or anything else that grants access. It is display-only and is never
 * consulted to decide whether a request/action is authorized — that decision
 * always comes from useSession()'s live result. Treat this file as a paint
 * optimization, not an auth mechanism.
 */

const SESSION_CACHE_KEY = "fo_session_display_cache";

export interface SessionDisplayCache {
  name: string;
  image: string | null;
  role: string;
}

/**
 * Reads the cached display data, if any.
 * Params: none.
 * Returns: the cached { name, image, role }, or null on first-ever visit,
 * when localStorage is unavailable (SSR, private browsing), or when the
 * stored value is missing/corrupt.
 * Throws: never — all failures are swallowed because this is a best-effort
 * paint optimization, not a required data source.
 */
export function readSessionCache(): SessionDisplayCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionDisplayCache>;
    // Guard against a corrupt or stale-shape entry (e.g. from a previous
    // version of this cache) so callers never render garbage.
    if (typeof parsed.name !== "string" || typeof parsed.role !== "string") return null;
    return { name: parsed.name, image: parsed.image ?? null, role: parsed.role };
  } catch {
    return null;
  }
}

/**
 * Overwrites the cache with fresh display data from a resolved, logged-in
 * session. Called every time useSession() resolves with a user, so the
 * cache never drifts from what was last actually rendered.
 * Params: data — the current display fields to persist.
 * Returns: void.
 * Throws: never — localStorage failures (quota, disabled) are swallowed.
 */
export function writeSessionCache(data: SessionDisplayCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable or full — safe to skip, this is only a cache.
  }
}

/**
 * Clears the cache.
 * Why: called whenever useSession() resolves with no session — a logout in
 * this tab, or a logout/session-expiry from another tab noticed the next
 * time this tab's useSession() re-validates. Without this, a stale name and
 * avatar could keep rendering after the user is actually logged out.
 * Returns: void.
 * Throws: never.
 */
export function clearSessionCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // ignore
  }
}
