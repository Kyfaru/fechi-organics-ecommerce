"use client";

import Image from "next/image";
import { Icon } from "@iconify/react";
import type { TestimonialItem } from "@/lib/queries/testimonials";

type Props = {
  testimonials: TestimonialItem[];
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon
          key={i}
          icon={i < rating ? "mdi:star" : "mdi:star-outline"}
          width={14}
          className={i < rating ? "text-[#fec700]" : "text-[#c4c4c4]"}
        />
      ))}
    </div>
  );
}

/** Before/after photo pair + quote card — shared by the grid and the mobile scroller. */
function TestimonialCard({ t }: { t: TestimonialItem }) {
  return (
    <div className="bg-[#f9f9f9] dark:bg-gray-900 rounded-[20px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.07)] h-full flex flex-col">
      <div className="grid grid-cols-2 gap-0.5 h-[160px] shrink-0">
        <div className="relative overflow-hidden">
          <div className="absolute top-2 left-2 z-10 bg-black/60 text-white text-[10px] font-body px-2 py-0.5 rounded-full">
            Before
          </div>
          <Image src={t.beforeUrl} alt={`${t.authorName} before`} fill className="object-cover" sizes="220px" />
        </div>
        <div className="relative overflow-hidden">
          <div className="absolute top-2 left-2 z-10 bg-[#27731e]/80 text-white text-[10px] font-body px-2 py-0.5 rounded-full">
            After
          </div>
          <Image src={t.afterUrl} alt={`${t.authorName} after`} fill className="object-cover" sizes="220px" />
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <StarRating rating={t.rating} />
        <p className="font-body text-[14px] text-[#40493c] dark:text-gray-400 leading-[1.6] mt-2 mb-3 italic flex-1">
          &ldquo;{t.quote}&rdquo;
        </p>
        <div>
          <p className="font-body font-semibold text-[#1a1c1c] dark:text-white text-[14px]">{t.authorName}</p>
          {t.location && (
            <p className="font-body text-[12px] text-[#a1a1a1] mt-0.5">{t.location}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Responsive testimonials grid for the public /testimonials page.
 * - lg and above: 4-column grid
 * - sm/md ("small sizes"): 2-column grid
 * - below sm (phone widths): horizontally-scrollable row with a hidden
 *   scrollbar (no repo-wide "scrollbar-hide" utility exists — grepped
 *   globals.css/tailwind config first — so scrollbar hiding is done the same
 *   way components/storefront/ProductDetailClient.tsx already does it:
 *   inline `scrollbarWidth`/`msOverflowStyle` for Firefox/IE plus the
 *   Tailwind v4 arbitrary-variant `[&::-webkit-scrollbar]:hidden`, the same
 *   bracket-selector convention used in components/checkout/DeliveryClient.tsx.
 */
export function TestimonialsGrid({ testimonials }: Props) {
  if (testimonials.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-body text-[15px] text-[#a1a1a1]">No testimonials yet — check back soon!</p>
      </div>
    );
  }

  return (
    <>
      {/* Phone widths only: horizontal scroll, cards sized so ~5 peek/scroll into view */}
      <div
        className="flex sm:hidden gap-4 overflow-x-auto pb-2 -mx-4 px-4 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {testimonials.map((t) => (
          <div key={t.id} className="flex-shrink-0 w-[220px]">
            <TestimonialCard t={t} />
          </div>
        ))}
      </div>

      {/* sm and up: 2-col grid, lg and up: 4-col grid */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-6">
        {testimonials.map((t) => (
          <TestimonialCard key={t.id} t={t} />
        ))}
      </div>
    </>
  );
}
