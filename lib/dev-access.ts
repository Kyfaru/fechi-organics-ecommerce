/**
 * Cookie name for the developer admin-access bypass (see app/dev/access and
 * app/api/dev/access). Kept in its own zero-dependency file so proxy.ts
 * (Edge runtime, no Prisma/Node APIs allowed) can import it too, alongside
 * lib/require-permission.ts and the admin layout guard.
 */
export const DEV_ACCESS_COOKIE = "fo-dev-access";
