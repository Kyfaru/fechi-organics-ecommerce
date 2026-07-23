/**
 * Next.js Edge middleware — route protection.
 *
 * IMPORTANT: This file runs on the Edge Runtime. It MUST NOT import anything
 * that depends on Node.js native modules (e.g., Prisma, pg, fs).
 *
 * Session validation strategy:
 * Better Auth signs a session token and stores it in a cookie named
 * "better-auth.session_token". We check for the presence of that cookie to
 * determine whether a session MAY exist. This is a fast, stateless check that
 * does not hit the database.
 *
 * Note: this check is not a cryptographic verification — it only proves the
 * cookie is present, not that it's valid. Full verification happens in the
 * API route handlers and server components when `auth.api.getSession()` is
 * called with the request. The middleware is the first gate; it stops 99% of
 * unauthenticated traffic at the CDN layer without a DB round-trip.
 *
 * Rules:
 *  - /login, /signup, and /admin/login are always public.
 *  - /api/auth/** is always public (Better Auth API).
 *  - All other routes require a session cookie to exist.
 *  - Unauthenticated requests to /admin/* → redirected to /admin/login.
 *  - Unauthenticated requests to other protected routes → redirected to /login.
 *
 * Note: this middleware deliberately does NOT redirect an authenticated
 * session away from /login, /signup, or /admin/login — doing that correctly
 * requires knowing the session's role (admin vs client), which means a DB
 * call this file intentionally avoids (see above). That responsibility lives
 * client-side instead: each auth page's own mount effect (app/admin/login/page.tsx,
 * app/(auth)/login/LoginForm.tsx, app/(auth)/signup/page.tsx) redirects away
 * a same-portal session and signs out a wrong-portal one — see also the
 * app-wide PortalSessionGuard in app/providers.tsx.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Routes anyone (guest or logged-in) can access without a session.
 * Storefront pages, public API routes, and auth pages are all public.
 */
const PUBLIC_PATHS = [
  // Auth pages
  "/login",
  "/signup",
  "/admin/login",
  "/forgot-password",
  "/api/auth",
  "/_next",
  "/favicon",
  "/img",
  "/logo",
  "/fonts",
  "/public",
  // Storefront pages
  "/",
  "/shop",
  "/cart",
  "/contact",
  "/blog",
  "/about",
  "/terms",
  "/privacy-policy",
  "/faq",
  "/testimonials",
  "/shipping",
  "/403",
  "/408",
  "/network-issue",
  "/coming-soon",
  // Public API namespaces
  "/api/storefront",
  "/api/cart",
  "/api/favorites",
  "/api/blog",
  "/api/currency",
  "/api/contact",
  "/api/qstash",
  "/api/zoho/webhook",
  "/api/countries",
  "/api/testimonials",
  "/api/products/options",
  "/api/track",
  "/api/webhooks",
  // Server-to-server workers (QStash signature / Vercel Cron secret verified
  // inside each handler) — never carry a session cookie, so they'd otherwise
  // 307-redirect before the handler's own auth check ever runs.
  "/api/admin/workers",
];

/**
 * Paths that should be rewritten to the "/coming-soon" page.
 * Empty by default — a dev-facing extension point for gating routes
 * that aren't ready for public traffic yet.
 */
const COMING_SOON_PATHS: string[] = [];

/** Auth API prefix — always pass through. */
const AUTH_API_PREFIX = "/api/auth";

/**
 * The cookie name Better Auth uses for session tokens.
 * Must match what Better Auth sets — default is "better-auth.session_token".
 * If you customise this in auth.ts, update here too.
 */
const SESSION_COOKIE = "better-auth.session_token";

/**
 * Apply security headers to every response that passes through to the app.
 * These are defence-in-depth headers; they complement (not replace) CSP.
 */
function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const sessionCookie =
    request.cookies.get(SESSION_COOKIE)?.value ??
    request.cookies.get(`__Secure-${SESSION_COOKIE}`)?.value;

  // 1. Always pass auth API through.
  if (pathname.startsWith(AUTH_API_PREFIX)) {
    return withSecurityHeaders(NextResponse.next());
  }

  // 2. Pass Next.js internals and static assets through.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    pathname.includes(".")
  ) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (
    COMING_SOON_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    const url = new URL("/coming-soon", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.rewrite(url);
  }

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Presence of the session cookie is the first-pass authentication signal.
  const hasSessionCookie = !!sessionCookie;

  // 3. Redirect unauthenticated users away from protected routes.
  //    Admin paths go to /admin/login; all other protected paths go to /login
  //    with a callbackUrl so the user lands back where they intended.
  if (!isPublicPath && !hasSessionCookie) {
    const loginDest = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    const loginUrl = new URL(loginDest, request.url);
    if (!pathname.startsWith("/admin")) {
      loginUrl.searchParams.set("callbackUrl", encodeURIComponent(pathname));
    }
    return NextResponse.redirect(loginUrl);
  }

  // Forward the resolved pathname as a request header for /admin/* routes so
  // the server-side layout guard (app/admin/(protected)/layout.tsx) can read
  // it via next/headers — there's no other way to get the current pathname
  // inside a server component, and it's needed there to resolve which
  // resource a page requires for the in-place 403 check.
  if (pathname.startsWith("/admin")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     *  - public folder files
     */
    "/((?!api/payments|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)",
  ],
};
