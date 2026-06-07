/**
 * Better Auth catch-all route handler.
 *
 * All auth requests — sign-in, sign-up, OAuth callbacks, session refresh,
 * OTP verification — are routed through this single endpoint by Better Auth's
 * internal router.
 *
 * Security notes:
 *  - CSRF protection is handled internally by Better Auth (SameSite cookies +
 *    Origin header validation).
 *  - Rate limiting is configured in lib/auth.ts (10 req / 60 s).
 *  - Secrets are consumed server-side only; this file imports from lib/auth.ts,
 *    which is never bundled into the client.
 */

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
