"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { initPostHog, posthog } from "@/lib/posthog";
import { UTM_COOKIE_NAME } from "@/lib/attribution";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = useRef("");
  const { data: session } = useSession();

  // Initialise PostHog once on client mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Track SPA pageviews on every route change
  useEffect(() => {
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    if (url === lastUrl.current) return; // deduplicate re-renders that don't change the URL
    lastUrl.current = url;
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname, searchParams]);

  // Capture UTM params on landing — last-touch attribution, 30-day cookie,
  // stamped onto cart/order at write time (see lib/attribution.ts).
  useEffect(() => {
    const source = searchParams.get("utm_source");
    if (!source) return;
    const medium = searchParams.get("utm_medium");
    const campaign = searchParams.get("utm_campaign");
    const value = JSON.stringify({ s: source, m: medium, c: campaign });
    const maxAge = 30 * 24 * 60 * 60;
    document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }, [searchParams]);

  // Track browser back/forward via popstate
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      posthog.capture("browser_navigation", {
        // Next.js App Router sets state.idx as a monotonic counter — a lower value means back
        delta: typeof (e.state as { idx?: number } | null)?.idx === "number" ? -1 : null,
        url: window.location.href,
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Identify the signed-in user — covers social login redirects and session restore
  useEffect(() => {
    if (!session?.user) return;
    const u = session.user as { id: string; email: string; name: string };
    posthog.identify(u.id, { email: u.email, name: u.name });
  }, [(session?.user as { id?: string } | undefined)?.id]);

  return <>{children}</>;
}
