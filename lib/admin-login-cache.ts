"use client";

/**
 * Per-email localStorage cache of low-sensitivity login-flow display data —
 * display name, role label, and which 2FA channels are on file — so a
 * repeat login from the same browser can paint the method-choice screen's
 * Email/SMS cards and the welcome greeting instantly, instead of waiting on
 * the network every time. The first login from a given browser still waits
 * on the real response (nothing to cache yet); every login after that
 * paints from here immediately, then silently reconciles once the fresh
 * response lands.
 *
 * Not encrypted, deliberately: there's no client-only secret to encrypt
 * with (a key embedded in this same JS bundle is readable by anyone with
 * access to the browser it's already stored in, so it wouldn't add real
 * protection). What's stored here is also genuinely low-sensitivity — never
 * the actual phone number, a password, or a session token — the same trust
 * level this codebase already gives hooks/use-persisted-filters.ts's
 * localStorage use ("Not a security boundary — just UX memory").
 */

export interface AdminLoginCache {
  fullName?: string;
  role?: string;
  hasPhone?: boolean;
  twoFaEmail?: boolean;
  twoFaPhone?: boolean;
}

const PREFIX = "admin-login-cache:";

function keyFor(email: string): string {
  return PREFIX + email.toLowerCase().trim();
}

export function readAdminLoginCache(email: string): AdminLoginCache | null {
  try {
    const raw = localStorage.getItem(keyFor(email));
    return raw ? (JSON.parse(raw) as AdminLoginCache) : null;
  } catch {
    return null;
  }
}

export function writeAdminLoginCache(email: string, data: AdminLoginCache): void {
  try {
    const existing = readAdminLoginCache(email) ?? {};
    localStorage.setItem(keyFor(email), JSON.stringify({ ...existing, ...data }));
  } catch {
    // Storage full/blocked — the login flow still works, just without the
    // instant-paint optimization next time.
  }
}
