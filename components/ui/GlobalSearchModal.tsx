"use client";

import { HighlightText } from "@/components/ui/HighlightText";

export type SearchResult = {
  title: string;
  description: string;
  url: string;
};

type GlobalSearchModalProps = {
  query: string;
  results: SearchResult[];
  loading: boolean;
  onSelect: (result: SearchResult) => void;
};

/**
 * Dropdown rendered below a search input — parent must wrap the input in a
 * `relative` container and render this as its sibling. Width intentionally
 * overshoots the input by 10px on each side.
 */
export function GlobalSearchModal({ query, results, loading, onSelect }: GlobalSearchModalProps) {
  if (!query.trim()) return null;

  return (
    <div
      data-search-modal
      className="absolute top-full left-[-10px] right-[-10px] mt-2 z-50 rounded-[10px] border border-[#c0cab8] dark:border-[#27731e] bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
    >
      {loading ? (
        <div className="px-4 py-3 text-[13px] text-[#6b7280]">Searching…</div>
      ) : results.length === 0 ? (
        <div className="px-4 py-3 text-[13px] text-[#6b7280]">No results for "{query}"</div>
      ) : (
        <div className="max-h-[168px] lg:max-h-[280px] overflow-y-auto divide-y divide-[#e5e7eb] dark:divide-gray-700">
          {results.map((result, i) => (
            <button
              key={`${result.url}-${i}`}
              type="button"
              onClick={() => onSelect(result)}
              className="block w-full text-left px-4 py-3 hover:bg-[#f5f7f3] dark:hover:bg-gray-800 transition-colors"
            >
              <p className="text-[13px] font-semibold text-[#1a1c1c] dark:text-white">{result.title}</p>
              <p className="mt-0.5 text-[12px] text-[#40493c] dark:text-gray-400 line-clamp-2">
                <HighlightText text={result.description} query={query} />
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
