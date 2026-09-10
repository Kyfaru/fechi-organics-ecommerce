import * as Sentry from "@sentry/nextjs";

interface ErrorContext {
  route?: string;
  userId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/**
 * Sentry.captureException with route/user/tag context attached, for use in
 * route-handler and client-page catch blocks. Safe to import from client
 * components — unlike trackServerEvent (lib/observability-server.ts), this
 * has no posthog-node/node:fs dependency to break the browser bundle.
 */
export function reportError(error: unknown, context: ErrorContext = {}) {
  const { route, userId, tags, extra } = context;
  Sentry.captureException(error, {
    tags: route ? { route, ...tags } : tags,
    user: userId ? { id: userId } : undefined,
    extra,
  });
}
