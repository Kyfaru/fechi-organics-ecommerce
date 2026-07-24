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
      // -mt-24 cancels the desktop navbar's own reserved flow height (mt-5 +
      // h-[76px] = 96px) so the hero starts flush at the very top of the
      // page, with the (always-sticky, never repositioned) navbar floating
      // over it via z-index instead of pushing it down.
      className="relative w-full md:-mt-24 h-[100vh] min-h-[640px] max-h-[920px] overflow-hidden rounded-b-[32px] md:rounded-b-[56px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
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
            sizes="100vw"
          />
          {/* Bottom gradient — grounds the text/CTA block */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
          {/* Top gradient — keeps the floating navbar's white text legible over any photo */}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 max-w-7xl mx-auto px-2.5 pb-14 md:pb-20 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <motion.div
              key={`text-${slide.id}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-4xl"
            >
              {slide.category && (
                <span className="inline-block bg-[#fec700] text-[#1a1c1c] text-xs font-semibold px-3 py-1 rounded-full mb-4">
                  {slide.category}
                </span>
              )}
              <h2 className="text-5xl md:text-7xl font-bold font-heading text-white leading-[1.05] mb-4">
                {slide.title}
              </h2>
              {slide.excerpt && (
                <p className="text-white/80 text-base md:text-lg leading-relaxed line-clamp-2 mb-3">
                  {slide.excerpt}
                </p>
              )}
              <p className="text-white/70 text-sm md:text-base">
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
                className="inline-flex items-center gap-2 bg-white text-[#1a1c1c] rounded-full px-8 py-4 text-sm font-semibold hover:bg-[#fec700] transition-colors shrink-0"
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

      {/* Marks the hero's bottom edge — Navbar watches this to know when to
          switch from transparent-over-hero back to its normal solid look. */}
      <div id="navbar-hero-sentinel" aria-hidden className="absolute bottom-0 left-0 w-px h-px" />
    </section>
  );
}
