import { Err } from "@/lib/api";

/**
 * Origins this app is allowed to receive state-changing requests from.
 * Falls back gracefully if one of the env vars isn't set in a given environment.
 */
const ALLOWED_ORIGINS = [process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_APP_URL].filter(
  (v): v is string => !!v,
);

function originFromHeaderValue(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Defense-in-depth CSRF guard for state-changing API routes that sit outside
 * Better Auth's `trustedOrigins` protection (everything under app/api/** except
 * app/api/auth/**). Better Auth's own endpoints already validate Origin against
 * trustedOrigins; this extends the same check to our hand-written routes.
 *
 * Only rejects when an Origin/Referer header IS present and doesn't match an
 * allowed origin — requests with neither header (e.g. some non-browser or
 * server-to-server callers, which should be authenticated by other means such
 * as a webhook signature) are allowed through unchanged.
 */
export function assertTrustedOrigin(req: Request): Response | null {
  if (ALLOWED_ORIGINS.length === 0) return null;

  const origin =
    originFromHeaderValue(req.headers.get("origin")) ??
    originFromHeaderValue(req.headers.get("referer"));

  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return null;

  return Err.forbidden();
}
