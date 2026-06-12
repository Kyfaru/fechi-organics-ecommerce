import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return; // guard: React Strict Mode double-invoke

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    autocapture: false,       // explicit capture only — avoids PII from form fields
    capture_pageview: false,  // PostHogProvider fires $pageview manually on each SPA route change
    persistence: "localStorage+cookie",
  });
}

export { posthog };
