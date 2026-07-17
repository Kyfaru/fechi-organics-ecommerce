"use client";

import { useScrollToSearchMatch } from "@/hooks/useScrollToSearchMatch";

/** Mounted once at the root layout — see hooks/useScrollToSearchMatch.ts. */
export function ScrollToSearchMatch() {
  useScrollToSearchMatch();
  return null;
}
