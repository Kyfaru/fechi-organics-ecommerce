import "server-only";
import { getPostHogServer } from "@/lib/posthog-server";

/**
 * Server-side PostHog capture (webhooks, workers, anything not running in the
 * browser). Kept out of lib/observability.ts because posthog-node pulls in
 * node:fs, which breaks Turbopack's client bundle if a client component ever
 * imports it transitively.
 */
export function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  getPostHogServer().capture({ distinctId, event, properties });
}
