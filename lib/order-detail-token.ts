/**
 * JWT-based token gating the payment-failed order detail page
 * (/admin/orders/payment-failed/[token]). Mirrors lib/password-reset.ts's
 * oslo/jwt pattern (HS256, purpose claim, subject-bound). This is an
 * internal admin link (not customer-facing), so a 14-day expiry is used —
 * generous enough that a legitimately-delayed follow-up doesn't expire
 * mid-investigation, while the token's blast radius on leak is small (view
 * one order, still gated by the recipient's own admin session + branch
 * scope at the page level).
 */

import { createJWT, validateJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";

const SECRET = new TextEncoder().encode(
  process.env.BETTER_AUTH_SECRET ?? "dev-secret-32-bytes-minimum-here!!"
);

const EXPIRES_IN = new TimeSpan(14, "d");

export type OrderDetailKind = "order" | "instore";

/**
 * Creates a signed JWT scoping access to one order's payment-failure detail
 * page.
 *
 * @param orderId - order.id or inStoreOrder.id to embed as the JWT subject.
 * @param kind - which table `orderId` belongs to.
 */
export async function createOrderDetailToken(
  orderId: string,
  kind: OrderDetailKind,
  expiresIn: TimeSpan = EXPIRES_IN,
): Promise<string> {
  return await createJWT("HS256", SECRET, { purpose: "order-detail:payment-failed", kind }, {
    subject: orderId,
    expiresIn,
    includeIssuedTimestamp: true,
  });
}

export type VerifyOrderDetailTokenResult =
  | { ok: true; orderId: string; kind: OrderDetailKind }
  | { ok: false; reason: "expired" | "invalid" };

export async function verifyOrderDetailToken(token: string): Promise<VerifyOrderDetailTokenResult> {
  try {
    const jwt = await validateJWT("HS256", SECRET, token);
    const payload = jwt.payload as Record<string, unknown>;
    if (
      payload.purpose !== "order-detail:payment-failed" ||
      !jwt.subject ||
      (payload.kind !== "order" && payload.kind !== "instore")
    ) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, orderId: jwt.subject, kind: payload.kind };
  } catch {
    return { ok: false, reason: isClaimedExpired(token) ? "expired" : "invalid" };
  }
}

function isClaimedExpired(token: string): boolean {
  try {
    const [, payloadPart] = token.split(".");
    const json = Buffer.from(payloadPart, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now();
  } catch {
    return false;
  }
}
