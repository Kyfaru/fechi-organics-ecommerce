/** Shared API response helpers */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export function ok<T>(data: T): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

export function created<T>(data: T): Response {
  return Response.json({ ok: true, data }, { status: 201 });
}

export function err(code: string, message: string, status = 400): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

export const Err = {
  validation: (msg: string) => err("VALIDATION", msg, 400),
  authRequired: () => err("AUTH_REQUIRED", "Sign in required", 401),
  forbidden: () => err("FORBIDDEN", "Access denied", 403),
  notFound: (what = "Resource") => err("NOT_FOUND", `${what} not found`, 404),
  rateLimited: () => err("RATE_LIMITED", "Too many requests", 429),
  internal: (msg = "Internal server error") => err("INTERNAL", msg, 500),
};
