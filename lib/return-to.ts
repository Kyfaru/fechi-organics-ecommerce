// Guards the ?returnTo= query param used to send a guest bounced out of
// checkout (see app/delivery/page.tsx) back where they were after login/signup.
// Only same-origin relative paths are allowed — anything else (protocol-
// relative "//evil.com", an absolute URL, or empty) falls back to "/".
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "/";
  return value;
}
