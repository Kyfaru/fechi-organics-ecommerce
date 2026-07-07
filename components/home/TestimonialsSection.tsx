"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type { TestimonialItem } from "@/lib/queries/testimonials";

/** Landing page only ever shows a short scroller — the full list lives on /testimonials. */
const MAX_LANDING_ITEMS = 5;

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
          width={16}
          className={i < rating ? "text-[#fec700]" : "text-[#c4c4c4]"}
        />
      ))}
    </div>
  );
}

export function TestimonialsSection({ testimonials }: Props) {
  // Fallback if no testimonials yet. Real data is already ordered by
  // sortOrder (see getTestimonials()) — cap at MAX_LANDING_ITEMS so the
  // landing page only ever shows a short scroller; the full list lives on
  // the dedicated /testimonials page.
  const items = (
    testimonials.length > 0
      ? testimonials
      : [
          {
            id: "1",
            authorName: "Amara Okonkwo",
            location: "Lagos, Nigeria",
            quote: "My skin has never looked better. The Radiance Serum transformed my complexion in just 3 weeks!",
            rating: 5,
            beforeUrl: "/img/placeholder.png",
            afterUrl: "/img/placeholder.png",
          },
          {
            id: "2",
            authorName: "Wanjiru Kamau",
            location: "Nairobi, Kenya",
            quote: "The Natural Tummy Tea is a game changer. My digestion improved and my skin started glowing from within.",
            rating: 5,
            beforeUrl: "/img/placeholder.png",
            afterUrl: "/img/placeholder.png",
          },
          {
            id: "3",
            authorName: "Thandiwe Dlamini",
            location: "Johannesburg, South Africa",
            quote: "The Shea Body Butter is absolutely divine. Deeply moisturising and the scent is heavenly.",
            rating: 4,
            beforeUrl: "/img/placeholder.png",
            afterUrl: "/img/placeholder.png",
          },
        ]
  ).slice(0, MAX_LANDING_ITEMS);

  return (
    <section className="py-16 px-4 md:px-8 bg-white dark:bg-gray-950">
      <div className="max-w-[1440px] mx-auto">
        {/* Section heading */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center font-heading font-semibold text-[#27731e] text-[40px] md:text-[58px] tracking-[-1.16px] mb-12"
        >
          Testimonials
        </motion.h2>

        {/* Testimonials scroller — short, 5-item preview; see /testimonials for the full list */}
        <div
          className="flex overflow-x-auto gap-8 pb-2 snap-x snap-proximity [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {items.map((t, idx) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: idx * 0.1 }}
              className="flex-shrink-0 w-[300px] md:w-[340px] snap-start bg-[#f9f9f9] dark:bg-gray-900 rounded-[24px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.07)]"
            >
              {/* Before / After images */}
              <div className="grid grid-cols-2 gap-0.5 h-[220px]">
                <div className="relative overflow-hidden">
                  <div className="absolute top-2 left-2 z-10 bg-black/60 text-white text-[11px] font-body px-2 py-0.5 rounded-full">
                    Before
                  </div>
                  <Image
                    src={t.beforeUrl}
                    alt={`${t.authorName} before`}
                    fill
                    className="object-cover"
                    sizes="200px"
                  />
                </div>
                <div className="relative overflow-hidden">
                  <div className="absolute top-2 left-2 z-10 bg-[#27731e]/80 text-white text-[11px] font-body px-2 py-0.5 rounded-full">
                    After
                  </div>
                  <Image
                    src={t.afterUrl}
                    alt={`${t.authorName} after`}
                    fill
                    className="object-cover"
                    sizes="200px"
                  />
                </div>
              </div>

              {/* Card body */}
              <div className="p-6">
                <StarRating rating={t.rating} />
                <p className="font-body text-[15px] text-[#40493c] dark:text-gray-400 leading-[1.6] mt-3 mb-4 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <p className="font-body font-semibold text-[#1a1c1c] dark:text-white text-[15px]">
                    {t.authorName}
                  </p>
                  {t.location && (
                    <p className="font-body text-[13px] text-[#a1a1a1] mt-0.5">
                      {t.location}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {/* View-all link — closes out the scroller */}
          <div className="flex-shrink-0 flex items-center justify-center pl-2">
            <Link
              href="/testimonials"
              aria-label="View all testimonials"
              className="w-14 h-14 rounded-full bg-[#27731e] hover:bg-[#1f5f18] text-white flex items-center justify-center shadow-[0_4px_16px_rgba(39,115,30,0.35)] transition-colors"
            >
              <Icon icon="mdi:arrow-right" width={24} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
