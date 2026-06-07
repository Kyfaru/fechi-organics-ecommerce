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
