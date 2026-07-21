"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Global-search "land on the word" behavior — works on ANY page with no
 * per-page wiring. When a `?q=` param is present, walks the rendered DOM for
 * the first text node containing it, wraps just that match in the same
 * `.highlight-mark` used by HighlightText (gold flash, fades over 5s via
 * globals.css), and scrolls it into view. Mounted once at the root layout.
 */
export function useScrollToSearchMatch() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = searchParams.get("q");

  useEffect(() => {
    if (!q || !q.trim()) return;
    const query = q.trim().toLowerCase();

    // Let the page finish its own render/data-fetch pass before we walk the DOM.
    const applyTimer = setTimeout(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue?.toLowerCase().includes(query)) return NodeFilter.FILTER_SKIP;
          const parent = (node as Text).parentElement;
          if (!parent || parent.closest("script, style, [data-search-modal], input, textarea")) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const textNode = walker.nextNode() as Text | null;
      if (!textNode?.parentNode) return;

      const value = textNode.nodeValue!;
      const idx = value.toLowerCase().indexOf(query);
      const before = value.slice(0, idx);
      const match = value.slice(idx, idx + query.length);
      const after = value.slice(idx + query.length);

      const mark = document.createElement("mark");
      mark.className = "highlight-mark";
      mark.textContent = match;

      const parent = textNode.parentNode;
      parent.insertBefore(document.createTextNode(before), textNode);
      parent.insertBefore(mark, textNode);
      parent.insertBefore(document.createTextNode(after), textNode);
      parent.removeChild(textNode);

      mark.scrollIntoView({ behavior: "smooth", block: "center" });

      // Matches the 5s highlight-fade animation in globals.css — unwrap once it's done.
      setTimeout(() => {
        mark.replaceWith(document.createTextNode(mark.textContent ?? match));
      }, 5200);

      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      router.replace(url.pathname + url.search, { scroll: false });
    }, 200);

    return () => clearTimeout(applyTimer);
    // Only re-run when the query or route actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pathname]);
}
