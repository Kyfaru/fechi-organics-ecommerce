"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminMe } from "@/hooks/use-can";

/**
 * Drop-in replacement for useState that also persists the value to
 * localStorage per admin user + key, so list-page filters (search text,
 * dropdown selections, toggled branches, etc.) survive navigating away and
 * coming back. Not a security boundary — just UX memory.
 */
export function usePersistedFilter<T>(
  key: string,
  defaultValue: T
): [T, (next: T | ((prev: T) => T)) => void] {
  const { data: me } = useAdminMe();
  const storageKey = me?.userId ? `admin-filter:${me.userId}:${key}` : null;

  const [value, setValue] = useState<T>(defaultValue);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!storageKey || loadedFor.current === storageKey) return;
    loadedFor.current = storageKey;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {
      // Corrupt/blocked storage — fall back to the default silently.
    }
  }, [storageKey]);

  const setPersisted = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(resolved));
          } catch {
            // Storage full/blocked — filter still applies for this session.
          }
        }
        return resolved;
      });
    },
    [storageKey]
  );

  return [value, setPersisted];
}
