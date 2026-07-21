import * as Sentry from "@sentry/nextjs";

// No-ops when DSN is unset (e.g. local dev without a Sentry project).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.SENTRY_DSN,
});
