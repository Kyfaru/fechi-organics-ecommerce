/**
 * JWT-based long-lived download token for in-store order invoices.
 *
 * Standalone from lib/password-reset.ts (that file is the customer/staff
 * reset-token flow and must not be imported from or modified) but mirrors its
 * oslo/jwt pattern: HS256, a `purpose` claim to prevent cross-flow reuse, and
 * a secret derived from BETTER_AUTH_SECRET.
 *
 * Why 30 days: this token is texted to a walk-in customer as a receipt link,
 * not a security-sensitive reset code — it just needs to keep working long
 * enough for them to redownload their receipt weeks later.
 */

import { createJWT, validateJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";

const SECRET = new TextEncoder().encode(
  process.env.BETTER_AUTH_SECRET ?? "dev-secret-32-bytes-minimum-here!!"
);

const EXPIRES_IN = new TimeSpan(30, "d");

/**
 * Creates a signed JWT invoice-download token for the given in-store order.
 *
 * @param inStoreOrderId - The inStoreOrder.id to embed as the JWT subject.
 * @returns A compact JWT string.
 */
export async function createInstoreInvoiceToken(inStoreOrderId: string): Promise<string> {
  return await createJWT("HS256", SECRET, { purpose: "instore-invoice" }, {
    subject: inStoreOrderId,
    expiresIn: EXPIRES_IN,
    includeIssuedTimestamp: true,
  });
}

/**
 * Verifies an in-store invoice download token and returns the embedded order ID.
 *
 * @param token - The JWT string from the invoice download URL.
 * @returns { inStoreOrderId } on success, or null if invalid/expired/wrong purpose.
 */
export async function verifyInstoreInvoiceToken(token: string): Promise<{ inStoreOrderId: string } | null> {
  try {
    const jwt = await validateJWT("HS256", SECRET, token);

    const payload = jwt.payload as Record<string, unknown>;
    if (payload.purpose !== "instore-invoice" || !jwt.subject) {
      return null;
    }

    return { inStoreOrderId: jwt.subject };
  } catch {
    // validateJWT throws on expiry, bad signature, malformed token — treat all as invalid.
    return null;
  }
}
