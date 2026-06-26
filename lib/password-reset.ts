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

/**
 * Creates a signed JWT password-reset token for the given user ID.
 *
 * @param userId - The Prisma user.id to embed as the JWT subject.
 * @param expiresIn - Optional token lifetime (defaults to 1 hour).
 * @returns A compact JWT string.
 */
export async function createResetToken(
  userId: string,
  expiresIn: TimeSpan = EXPIRES_IN,
): Promise<string> {
  return await createJWT("HS256", SECRET, { purpose: "password-reset" }, {
    subject: userId,
    expiresIn,
    includeIssuedTimestamp: true,
  });
}

/**
 * Verifies a password-reset JWT and returns the embedded user ID.
 *
 * @param token - The JWT string from the reset URL query param.
 * @returns { userId } on success, or null if the token is invalid/expired.
 */
export async function verifyResetToken(token: string): Promise<{ userId: string } | null> {
  try {
    const jwt = await validateJWT("HS256", SECRET, token);

    // Guard: ensure this token was issued for password-reset, not another purpose.
    const payload = jwt.payload as Record<string, unknown>;
    if (payload.purpose !== "password-reset" || !jwt.subject) {
      return null;
    }

    return { userId: jwt.subject };
  } catch {
    // validateJWT throws on expiry, bad signature, malformed token — treat all as invalid.
    return null;
  }
}
