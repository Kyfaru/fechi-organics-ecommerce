import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Key must be 32 bytes (64 hex chars) stored in BRANCH_SECRET_ENCRYPTION_KEY
function getKey(): Buffer {
  const hexKey = process.env.BRANCH_SECRET_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[crypto] BRANCH_SECRET_ENCRYPTION_KEY is not set or invalid. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    // Fallback key for dev (DO NOT USE IN PRODUCTION)
    return Buffer.from("0".repeat(64), "hex");
  }
  return Buffer.from(hexKey, "hex");
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: iv_b64:ciphertext_b64:authtag_b64
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    encrypted.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a value produced by encrypt().
 * Throws if the payload is invalid or authentication fails.
 */
export function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted payload format");

  const [ivB64, ciphertextB64, authTagB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
