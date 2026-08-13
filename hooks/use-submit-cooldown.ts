"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SUCCESS_COOLDOWN_MS = 5_000;
const MIN_ERROR_COOLDOWN_MS = 5_000;
const HEALTH_POLL_INTERVAL_MS = 2_000;

/**
 * Shared post-submit button cooldown for the in-store payment panels.
 * Success: flat 5s. Failure: poll GET /api/health every ~2s and re-enable
 * as soon as it reports healthy, with a 5s floor regardless — a fast health
 * check shouldn't let the admin re-fire a charge before the failure that
 * just happened has had a moment to settle.
 */
export function useSubmitCooldown() {
  const [cooldown, setCooldown] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const startCooldown = useCallback(
    (outcome: "success" | "error") => {
      clearTimers();
      setCooldown(true);

      if (outcome === "success") {
        timeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setCooldown(false);
        }, SUCCESS_COOLDOWN_MS);
        return;
      }

      const startedAt = Date.now();
      const checkHealth = async () => {
        try {
          const res = await fetch("/api/health");
          if (res.ok && Date.now() - startedAt >= MIN_ERROR_COOLDOWN_MS) {
            clearTimers();
            if (mountedRef.current) setCooldown(false);
          }
        } catch {
          // Network hiccup checking health — stay in cooldown, next poll retries.
        }
      };
      pollRef.current = setInterval(checkHealth, HEALTH_POLL_INTERVAL_MS);
    },
    [clearTimers],
  );

  return { cooldown, startCooldown };
}
