import * as Sentry from "@sentry/nextjs";
import { getPostHogServer } from "@/lib/posthog-server";

interface ErrorContext {
  route?: string;
  userId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/** Sentry.captureException with route/user/tag context attached, for use in route-handler catch blocks. */
export function reportError(error: unknown, context: ErrorContext = {}) {
  const { route, userId, tags, extra } = context;
  Sentry.captureException(error, {
    tags: route ? { route, ...tags } : tags,
    user: userId ? { id: userId } : undefined,
    extra,
  });
}

/** Server-side PostHog capture (webhooks, workers, anything not running in the browser). */
export function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  getPostHogServer().capture({ distinctId, event, properties });
}
