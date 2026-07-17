"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { BlogPostCard } from "@/lib/queries/blog";
import { r2PublicUrl } from "@/lib/r2";

const ROTATE_MS = 5500;
const MAX_SLIDES = 5;

function coverImageUrl(key: string | null): string {
  return key ? r2PublicUrl(key) : "/blog/placeholder.webp";
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(d));
}

export function HeroCarousel({ posts }: { posts: BlogPostCard[] }) {
  const slides = useMemo(() => {
    const featured = posts.filter((p) => p.isFeatured);
    const source = featured.length >= 2 ? featured : posts;
    return source.slice(0, MAX_SLIDES);
  }, [posts]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length, paused]);

  if (slides.length === 0) return null;
  const slide = slides[index];

  return (
    <section
      className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative h-[420px] md:h-[520px] rounded-3xl overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <Image
              src={coverImageUrl(slide.featuredImage)}
              alt={slide.title}
              fill
              priority={index === 0}
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 1152px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <motion.div
                key={`text-${slide.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="max-w-xl"
              >
                {slide.category && (
                  <span className="inline-block bg-[#fec700] text-[#1a1c1c] text-xs font-semibold px-3 py-1 rounded-full mb-3">
                    {slide.category}
                  </span>
                )}
                <h2 className="text-2xl md:text-4xl font-bold font-heading text-white leading-tight mb-2">
                  {slide.title}
                </h2>
                <p className="text-white/70 text-sm">
                  {slide.author?.name ?? "Fechi Organics"}
                  {slide.publishedAt ? ` · ${formatDate(slide.publishedAt)}` : ""}
                </p>
              </motion.div>

              <motion.div
                key={`cta-${slide.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  href={`/blog/${slide.slug}`}
                  className="inline-flex items-center gap-2 bg-white text-[#1a1c1c] rounded-full px-6 py-3 text-sm font-semibold hover:bg-[#fec700] transition-colors"
                >
                  Read Story →
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* indicators */}
        {slides.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={[
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80",
                ].join(" ")}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
