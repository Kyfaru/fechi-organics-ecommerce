"use client";

/**
 * HighlightText — generic, reusable text-match highlighter.
 *
 * Wraps every case-insensitive occurrence of `query` inside `text` in a
 * `<mark>` that flashes a highlight background and fades out over ~3s.
 *
 * Restart-on-every-keystroke: the animation must restart from full opacity
 * each time `query` changes, even if the same substring was already
 * highlighted (e.g. typing "gr" -> "gre" -> "gree" against "Green Zone").
 * CSS animations do NOT restart just because the matched text is unchanged,
 * so each <mark> is keyed on the (lowercased) query string. Changing the key
 * forces React to unmount + remount the node, which restarts the CSS
 * animation defined in globals.css (`.highlight-mark` / `@keyframes
 * highlight-fade`).
 *
 * No admin-specific imports here on purpose — this is shared UI usable from
 * any part of the app (storefront, admin, etc).
 */

type HighlightTextProps = {
  /** Full text to render. */
  text: string;
  /** Search query to highlight matches of (case-insensitive substring). */
  query: string;
  /** Optional extra classes merged onto the <mark> highlight wrapper. */
  markClassName?: string;
};

/** Escapes regex special characters so a raw user-typed query is safe to
 *  drop into `new RegExp(...)`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightText({ text, query, markClassName = "" }: HighlightTextProps) {
  const trimmedQuery = query.trim();

  // Nothing to highlight — render the plain text, no wrapping overhead.
  if (!trimmedQuery) return <>{text}</>;

  let regex: RegExp;
  try {
    regex = new RegExp(`(${escapeRegExp(trimmedQuery)})`, "gi");
  } catch {
    // Defensive fallback: escapeRegExp should make this unreachable, but a
    // highlight bug should never take down the surrounding page.
    console.error("[HighlightText] failed to build regex for query", trimmedQuery);
    return <>{text}</>;
  }

  const parts = text.split(regex);

  // No match found in this particular text — render as-is.
  if (parts.length === 1) return <>{text}</>;

  const keySeed = trimmedQuery.toLowerCase();

  return (
    <>
      {parts.map((part, i) =>
        // split() with a single capturing group returns matches at odd indices.
        i % 2 === 1 ? (
          <mark
            // Keying on the query (not just the index) is the restart trick:
            // every keystroke produces a new key -> new DOM node -> animation
            // starts over from 0%, even if `part` itself didn't change.
            key={`${keySeed}-${i}`}
            className={`highlight-mark ${markClassName}`}
          >
            {part}
          </mark>
        ) : (
          <span key={`${keySeed}-${i}-plain`}>{part}</span>
        )
      )}
    </>
  );
}
