/** Shared beforeSend scrubbing for both sentry.server.config.ts and sentry.edge.config.ts. */

const SENSITIVE_KEY = /password|token|secret|otp|pin|cvv|authorization|cookie/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[Redacted]" : redact(v),
      ])
    );
  }
  return value;
}

/** Strips passwords/tokens/OTPs/cookies/etc. from an event's request payload before it leaves the app. */
export function scrubSentryEvent<T extends { request?: unknown }>(event: T): T {
  if (event.request) {
    event.request = redact(event.request) as T["request"];
  }
  return event;
}
