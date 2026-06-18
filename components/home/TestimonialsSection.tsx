"use client";

import Image from "next/image";
import { motion } from "framer-motion";
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
          width={16}
          className={i < rating ? "text-[#fec700]" : "text-[#c4c4c4]"}
        />
      ))}
    </div>
  );
}

export function TestimonialsSection({ testimonials }: Props) {
  // Fallback if no testimonials yet
  const items =
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
        ];

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

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((t, idx) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: idx * 0.1 }}
              className="bg-[#f9f9f9] dark:bg-gray-900 rounded-[24px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.07)]"
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
        </div>
      </div>
    </section>
  );
}
