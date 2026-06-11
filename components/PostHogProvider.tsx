"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { initPostHog, posthog } from "@/lib/posthog";

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
