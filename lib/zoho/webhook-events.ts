// Event names this app listens for on Zoho Books item webhooks — kept here
// (not just inline in the route) so the admin panel can build one webhook
// URL per event without duplicating the list. See app/api/zoho/webhook/route.ts
// for why the event is carried in the URL instead of the request body.
export const ZOHO_WEBHOOK_EVENTS = ["item_created", "item_updated", "item_deleted"] as const;

export function zohoWebhookUrls(appUrl: string, organizationId: string): Record<string, string> {
  return Object.fromEntries(
    ZOHO_WEBHOOK_EVENTS.map((event) => [
      event,
      `${appUrl}/api/zoho/webhook?organizationId=${organizationId}&event=${event}`,
    ]),
  );
}
