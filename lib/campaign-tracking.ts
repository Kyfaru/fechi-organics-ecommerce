/**
 * Rewrites every <a href="..."> in campaign HTML to route through
 * /api/track/click first, so a click can be attributed to this
 * campaign+recipient before redirecting on to the real destination.
 */
export function wrapLinksForTracking(html: string, campaignId: string, userId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return html.replace(/href="([^"]+)"/g, (match, href: string) => {
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return match;
    const tracked = `${base}/api/track/click?c=${encodeURIComponent(campaignId)}&u=${encodeURIComponent(userId)}&url=${encodeURIComponent(href)}`;
    return `href="${tracked}"`;
  });
}
