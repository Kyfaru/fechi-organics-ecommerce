/**
 * JWT-based password reset token utilities.
 *
 * Uses oslo/jwt (createJWT / validateJWT) which is already in the dependency
 * tree via the oslo package. Tokens are signed with HS256 and expire in 1 hour.
 * The purpose claim guards against token reuse across different flows.
 */

import { createJWT, validateJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";

// Secret key derived from the Better Auth secret env var. Must be 32+ bytes.
const SECRET = new TextEncoder().encode(
  process.env.BETTER_AUTH_SECRET ?? "dev-secret-32-bytes-minimum-here!!"
);

// 1 hour
const EXPIRES_IN = new TimeSpan(1, "h");

export type ResetTokenClaims = { name?: string; email?: string };

/**
 * Creates a signed JWT password-reset token for the given user ID.
 *
 * @param userId - The Prisma user.id to embed as the JWT subject.
 * @param expiresIn - Optional token lifetime (defaults to 1 hour).
 * @param extraClaims - Optional non-sensitive display claims (name/email) so
 *   the reset page can greet the recipient without a separate lookup.
 * @returns A compact JWT string.
 */
export async function createResetToken(
  userId: string,
  expiresIn: TimeSpan = EXPIRES_IN,
  extraClaims: ResetTokenClaims = {},
): Promise<string> {
  return await createJWT("HS256", SECRET, { purpose: "password-reset", ...extraClaims }, {
    subject: userId,
    expiresIn,
    includeIssuedTimestamp: true,
  });
}

export type VerifyResetTokenResult =
  | { ok: true; userId: string; name?: string; email?: string }
  | { ok: false; reason: "expired" | "invalid" };

/**
 * Verifies a password-reset JWT and returns the embedded user ID (plus any
 * display claims), or a reason the token was rejected.
 *
 * @param token - The JWT string from the reset URL query param.
 */
export async function verifyResetToken(token: string): Promise<VerifyResetTokenResult> {
  try {
    const jwt = await validateJWT("HS256", SECRET, token);

    // Guard: ensure this token was issued for password-reset, not another purpose.
    const payload = jwt.payload as Record<string, unknown>;
    if (payload.purpose !== "password-reset" || !jwt.subject) {
      return { ok: false, reason: "invalid" };
    }

    return {
      ok: true,
      userId: jwt.subject,
      name: typeof payload.name === "string" ? payload.name : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    // validateJWT throws on expiry, bad signature, malformed token. Peek at
    // the claimed `exp` (without verifying the signature) purely to pick the
    // right message — this grants no privilege, the password change still
    // requires a signature-verified token above.
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
