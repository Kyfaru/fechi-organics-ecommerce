import * as Sentry from "@sentry/nextjs";
import { initPostHog, posthog } from "@/lib/posthog";

// PostHog must be initialized first so its Sentry integration instance exists
// when Sentry.init runs — it links each Sentry issue to the session replay
// that led to it, and mirrors the exception into PostHog as an $exception event.
initPostHog();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations:
    process.env.NEXT_PUBLIC_SENTRY_ORG && process.env.NEXT_PUBLIC_SENTRY_PROJECT_ID
      ? [
          posthog.sentryIntegration({
            organization: process.env.NEXT_PUBLIC_SENTRY_ORG,
            projectId: Number(process.env.NEXT_PUBLIC_SENTRY_PROJECT_ID),
          }),
        ]
      : [],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
