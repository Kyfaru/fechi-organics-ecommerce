"use client";

import { useEffect } from "react";

/**
 * Forces a hard reload if this page is ever shown again via the browser's
 * back-forward cache (bfcache) — e.g. pressing Back after logging in, or
 * after just navigating away and back. `Cache-Control: no-store` (proxy.ts,
 * applied to /login, /signup, /admin/login) discourages this but isn't
 * reliable across every browser, since bfcache snapshots the whole page
 * (DOM + JS state) rather than re-checking response headers. The `pageshow`
 * event with `persisted: true` is the standard, reliable signal that a page
 * came back from bfcache rather than a fresh load, and reloading is the
 * standard way to defeat it — guarantees a login/signup page is never shown
 * with stale form/modal state, and re-runs the page's own "already signed
 * in, redirect away" check on a real request instead of a cached snapshot.
 */
export function useReloadOnBfcacheRestore() {
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);
}
