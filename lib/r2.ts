import { S3Client } from "@aws-sdk/client-s3";

/** Singleton S3-compatible client for Cloudflare R2.
 * Credentials are read from env vars at module load time.
 * R2_ACCOUNT_ID must be the bare account hash (not a full URL).
 */
export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/** Resolve a Cloudflare R2 object key to a public URL.
 *
 * In production set R2_PUBLIC_BASE to your CDN/bucket URL, e.g.
 * https://cdn.fechiorganics.com
 *
 * In development (no R2_PUBLIC_BASE) keys starting with "img/" are mapped to
 * /public/img/<filename> so the local /public directory is used as a fallback.
 */
export function r2PublicUrl(objectKey: string): string {
  const base = process.env.R2_PUBLIC_BASE;
  if (base) {
    return `${base.replace(/\/$/, "")}/${objectKey}`;
  }
  // Local fallback: "img/foo.png" → "/img/foo.png"  (Next.js serves /public)
  if (objectKey.startsWith("img/")) {
    return `/${objectKey}`;
  }
  return `/${objectKey}`;
}
