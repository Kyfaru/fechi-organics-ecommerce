import { PostHog } from "posthog-node";

let client: PostHog | undefined;

/**
 * flushAt/flushInterval are set to send immediately — serverless functions can
 * freeze or exit before posthog-node's default batching would flush otherwise.
 */
export function getPostHogServer(): PostHog {
  if (!client) {
    client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}
