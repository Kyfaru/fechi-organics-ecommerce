/**
 * Cookie names for the cookie-consent banner. Kept in its own
 * zero-dependency file (same rationale as lib/dev-access.ts) so it can be
 * imported from anywhere — API routes, server components — without pulling
 * in Prisma/Node-only code.
 */

/** "1" once the visitor has accepted — the fast, non-cryptographic
 * visibility check. The actual proof of consent lives in the encrypted
 * db.cookieConsent row created at the same time this is set. */
export const CONSENT_COOKIE = "fo-consent";

/** Guest identity token, mirrors the "fechi_cart" guest-cart cookie. */
export const CONSENT_GUEST_COOKIE = "fo-consent-guest";

export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
